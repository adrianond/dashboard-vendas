import type { Run, RunTree } from "langsmith";
import { getCurrentRunTree, traceable } from "langsmith/traceable";
import { env } from "../env";
import type { ConfigAgente } from "./config";
import { extrairResultado, type Agente } from "./graph";
import type { EstadoAgente, ResultadoAgente } from "./state";

// Camada 9 de segurança (PRD da Etapa 2, seção 10.1): cada pergunta vira um trace "agente-vendas"
// no LangSmith, com o desfecho e os guardrails nos metadados. Os traces levam só a pergunta, o
// thread e o que o grafo produziu (views sem dados pessoais); nunca o .env nem chaves.

export const NOME_DO_TRACE = "agente-vendas";

export function modelosDaConfig(config: Pick<ConfigAgente, "modelos">): string[] {
  return [config.modelos.rapido, config.modelos.principal];
}

// "guardrail-bloqueio" marca execuções em que algum guardrail reprovou (inclusive uma query
// reprovada e depois corrigida), para filtrar no LangSmith.
export function tagsDoTrace(estado: EstadoAgente | null, modelos: string[]): string[] {
  const tags = ["etapa-2", ...modelos];
  if (estado?.guardrails.some((guardrail) => !guardrail.aprovado)) tags.push("guardrail-bloqueio");
  return tags;
}

export function metadadosDoTrace(estado: EstadoAgente, threadId: string) {
  return {
    thread_id: threadId,
    categoria: estado.categoria,
    status: estado.status,
    tentativas: estado.tentativas,
    sqlExecutado: estado.sqlExecutado,
    linhas: estado.linhas.length,
    truncado: estado.truncado,
    guardrails: estado.guardrails,
  };
}

let avisoEmitido = false;

// Sem a chave, o agente roda sem rastreamento: um aviso único e o LangChain deixa de tentar enviar.
function rastreamentoAtivo(): boolean {
  if (env.LANGSMITH_TRACING !== "true") return false;
  if (env.LANGSMITH_API_KEY) return true;
  if (!avisoEmitido) {
    console.warn("LangSmith: LANGSMITH_API_KEY não definida; o agente roda sem rastreamento.");
    avisoEmitido = true;
  }
  process.env.LANGSMITH_TRACING = "false";
  return false;
}

export type Execucao = { resultado: ResultadoAgente; estado: EstadoAgente; urlDoTrace: string | null };

export async function perguntarComRastreamento(
  agente: Agente,
  { pergunta, threadId }: { pergunta: string; threadId: string },
  modelos: string[],
): Promise<Execucao> {
  const opcoes = { configurable: { thread_id: threadId } };
  const invocar = async (texto: string) => (await agente.invoke({ pergunta: texto }, opcoes)) as EstadoAgente;

  if (!rastreamentoAtivo()) {
    const estado = await invocar(pergunta);
    return { resultado: extrairResultado(estado), estado, urlDoTrace: null };
  }

  let estado: EstadoAgente | undefined;
  let trace: RunTree | undefined;
  const executar = traceable(
    async (entrada: { pergunta: string; thread_id: string }): Promise<ResultadoAgente> => {
      trace = getCurrentRunTree();
      estado = await invocar(entrada.pergunta);
      // Metadados e tags do desfecho: o LangSmith os recebe no fechamento do trace.
      trace.extra = { ...trace.extra, metadata: { ...trace.extra?.metadata, ...metadadosDoTrace(estado, threadId) } };
      trace.tags = tagsDoTrace(estado, modelos);
      return extrairResultado(estado);
    },
    { name: NOME_DO_TRACE, run_type: "chain", tags: tagsDoTrace(null, modelos), metadata: { thread_id: threadId } },
  );

  const resultado = await executar({ pergunta, thread_id: threadId });
  return { resultado, estado: estado!, urlDoTrace: await urlDoTrace(trace) };
}

async function urlDoTrace(trace: RunTree | undefined): Promise<string | null> {
  if (!trace) return null;
  try {
    await trace.client.awaitPendingTraceBatches();
    // Com { run, projectOpts } o link sai do projeto, sem ler a run na API: numa execução rápida
    // (ex.: recusa) ela pode ainda não ter sido registrada, e a leitura por runId falha.
    return await trace.client.getRunUrl({
      run: { id: trace.id } as Run,
      projectOpts: { projectName: trace.project_name },
    });
  } catch {
    return null; // o link é só conveniência; a falha não afeta a resposta
  }
}
