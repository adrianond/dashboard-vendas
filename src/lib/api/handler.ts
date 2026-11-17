import "server-only";
import { randomUUID } from "node:crypto";
import { ErroApi, respostaDeErro } from "./errors";
import { chaveDoCliente, consumirLimite, limitadores as limitadoresPadrao, type CategoriaLimite, type Limitadores } from "./rate-limit";

// Wrapper comum das rotas (PRD da Etapa 3, seção 7.1): requestId, rate limit, conversão de erros e
// log estruturado. As rotas validam a entrada com lerConsulta/lerCorpoJson, que lançam ErroApi.

export type ContextoRota = {
  request: Request;
  requestId: string;
  // Campos extras para o log da requisição (ex.: categoria, status e tentativas do agente).
  log: Record<string, string | number | boolean | null>;
};

export type EntradaLog = {
  requestId: string;
  rota: string;
  metodo: string;
  status: number;
  duracaoMs: number;
  [campo: string]: string | number | boolean | null;
};

export type OpcoesRota = {
  rota: string;
  limite: CategoriaLimite | null;
  executar: (contexto: ContextoRota) => Response | Promise<Response>;
  // Injetáveis nos testes.
  limitadores?: Limitadores;
  registrarLog?: (entrada: EntradaLog) => void;
};

// Uma linha JSON por requisição. Nunca o corpo da requisição nem a resposta.
function registrarNoConsole(entrada: EntradaLog): void {
  console.info(JSON.stringify(entrada));
}

export function criarRota({ rota, limite, executar, limitadores = limitadoresPadrao, registrarLog = registrarNoConsole }: OpcoesRota) {
  return async (request: Request): Promise<Response> => {
    const inicio = performance.now();
    const requestId = randomUUID();
    const log: ContextoRota["log"] = {};
    let resposta: Response;

    try {
      if (limite) {
        const resultado = consumirLimite(limite, chaveDoCliente(request), Date.now(), limitadores);
        if (!resultado.ok) throw new ErroApi("LIMITE_EXCEDIDO", undefined, { "retry-after": String(resultado.retryAfterSeg) });
      }
      resposta = await executar({ request, requestId, log });
    } catch (erro) {
      // Só o tipo do erro vai para o log: a mensagem pode conter SQL ou dados da consulta.
      if (!(erro instanceof ErroApi)) log.erroInterno = erro instanceof Error ? erro.name : typeof erro;
      resposta = respostaDeErro(erro instanceof ErroApi ? erro : new ErroApi("ERRO_INTERNO"), requestId);
    }

    resposta.headers.set("x-request-id", requestId);
    registrarLog({
      requestId,
      rota,
      metodo: request.method,
      status: resposta.status,
      duracaoMs: Math.round(performance.now() - inicio),
      ...log,
    });
    return resposta;
  };
}

type LeituraRecusada = { ok: false; mensagens: string[] };

// Query string de GET: lerFiltros/lerFiltrosRanking (src/lib/indicadores) já devolvem mensagens
// sem ecoar os valores recebidos. Devolve a leitura aprovada ({ ok: true, ... }).
export function lerConsulta<T extends { ok: true }>(request: Request, leitor: (parametros: URLSearchParams) => T | LeituraRecusada): T {
  const leitura = leitor(new URL(request.url).searchParams);
  if (!leitura.ok) throw new ErroApi("ENTRADA_INVALIDA", `Parâmetros inválidos: ${(leitura as LeituraRecusada).mensagens.join("; ")}.`);
  return leitura as T;
}
