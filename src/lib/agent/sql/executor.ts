import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { configPadrao, type ConfigAgente } from "../config";

// Camada 4 de segurança (PRD da Etapa 2, seção 9). A query, já aprovada pelo validador, roda num
// processo filho (executor-worker.ts) com a própria conexão somente leitura. O better-sqlite3 é
// síncrono e não interrompe uma query em andamento: no timeout, só matar o processo garante o fim
// (worker.terminate() não encerra uma thread presa no SQLite; ver Histórico do PRD 2).

export type Linha = Record<string, unknown>;
export type ResultadoSql = { sqlExecutado: string; colunas: string[]; linhas: Linha[]; truncado: boolean };
export type ResultadoExecucao = ({ ok: true } & ResultadoSql) | { ok: false; sqlExecutado: string; erro: string };

export interface SqlExecutor {
  executar(sql: string): Promise<ResultadoExecucao>;
}

export type LimitesExecucao = Pick<ConfigAgente, "maxLinhas" | "timeoutMs">;
export type LimitesResumo = Pick<ConfigAgente, "maxLinhasResposta" | "maxResultadoChars">;

// Protocolo com o processo filho (IPC).
export type PedidoAoWorker = { sql: string };
export type RespostaDoWorker = { tipo: "resultado"; colunas: string[]; linhas: Linha[] } | { tipo: "erro"; erro: string };
export type MensagemDoWorker = { tipo: "pronto" } | RespostaDoWorker;

const ARQUIVO_DO_WORKER = fileURLToPath(new URL("./executor-worker.ts", import.meta.url));
// Subir o processo (Node + tsx + conexão) não conta no timeout da query, mas também tem limite.
const LIMITE_INICIALIZACAO_MS = 15_000;
const MAX_TEXTO_CHARS = 200;

export function aplicarLimite(sql: string, maxLinhas: number): string {
  return `SELECT * FROM (${sql}) LIMIT ${maxLinhas + 1}`;
}

export function criarExecutor(limites: LimitesExecucao = configPadrao): SqlExecutor {
  return {
    async executar(sql) {
      const sqlExecutado = aplicarLimite(sql, limites.maxLinhas);
      const resposta = await rodarNoWorker(sqlExecutado, limites.timeoutMs);
      if (resposta.tipo === "erro") return { ok: false, sqlExecutado, erro: resposta.erro };
      return {
        ok: true,
        sqlExecutado,
        colunas: resposta.colunas,
        linhas: resposta.linhas.slice(0, limites.maxLinhas),
        truncado: resposta.linhas.length > limites.maxLinhas,
      };
    },
  };
}

export function executarSql(sql: string, limites: LimitesExecucao = configPadrao): Promise<ResultadoExecucao> {
  return criarExecutor(limites).executar(sql);
}

// Nunca rejeita: toda falha (timeout, erro do SQLite, processo que morre) vira { tipo: "erro" }.
function rodarNoWorker(sqlExecutado: string, timeoutMs: number): Promise<RespostaDoWorker> {
  return new Promise((resolve) => {
    const filho = fork(ARQUIVO_DO_WORKER, [], {
      execArgv: ["--import", "tsx"],
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    let encerrado = false;
    let prazo: NodeJS.Timeout | undefined;

    const encerrar = (resposta: RespostaDoWorker) => {
      if (encerrado) return;
      encerrado = true;
      clearTimeout(prazo);
      filho.kill("SIGKILL");
      resolve(resposta);
    };
    const falhar = (erro: string) => encerrar({ tipo: "erro", erro });

    prazo = setTimeout(() => falhar("o processo de consulta não iniciou a tempo"), LIMITE_INICIALIZACAO_MS);
    filho.on("message", (mensagem: MensagemDoWorker) => {
      if (mensagem.tipo !== "pronto") return encerrar(mensagem);
      clearTimeout(prazo);
      prazo = setTimeout(() => falhar(mensagemDeTimeout(timeoutMs)), timeoutMs);
      filho.send({ sql: sqlExecutado } satisfies PedidoAoWorker);
    });
    filho.on("error", (erro) => falhar(`falha no processo de consulta: ${erro.message}`));
    filho.on("exit", (codigo) => falhar(`o processo de consulta terminou sem responder (código ${codigo})`));
  });
}

function mensagemDeTimeout(timeoutMs: number): string {
  return (
    `tempo limite de ${timeoutMs} ms excedido: query muito cara, simplifique ` +
    "(filtre por período, evite produtos cartesianos e agregue antes de juntar views)"
  );
}

// Versão do resultado que vai para o LLM (o estado guarda as linhas completas).
export function resumirParaLlm(resultado: ResultadoSql, limites: LimitesResumo): string {
  const linhas = resultado.linhas.slice(0, limites.maxLinhasResposta).map(encurtarTextos);
  const serializar = () =>
    JSON.stringify({
      colunas: resultado.colunas,
      linhas,
      linhasNaoEnviadas: resultado.linhas.length - linhas.length,
      resultadoTruncadoNoBanco: resultado.truncado,
    });

  let json = serializar();
  while (json.length > limites.maxResultadoChars && linhas.length > 0) {
    linhas.pop();
    json = serializar();
  }
  return json;
}

function encurtarTextos(linha: Linha): Linha {
  return Object.fromEntries(
    Object.entries(linha).map(([coluna, valor]) => [
      coluna,
      typeof valor === "string" && valor.length > MAX_TEXTO_CHARS ? `${valor.slice(0, MAX_TEXTO_CHARS)}…` : valor,
    ]),
  );
}
