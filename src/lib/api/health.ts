import "server-only";
import { readonlyDb } from "../db/readonly-client";
import { env } from "../env";

// Saúde do serviço (PRD da Etapa 3, seção 7.3). Só estes 4 campos: sem versões, caminhos nem
// variáveis de ambiente.

export type Saude = {
  status: "ok" | "erro";
  banco: "ok" | "erro";
  agente: "real" | "fake";
  langsmith: boolean;
};

type ConsultaMinima = { prepare(sql: string): { get(): unknown } };

export function verificarSaude(banco: ConsultaMinima = readonlyDb): Saude {
  let bancoOk: boolean;
  try {
    bancoOk = banco.prepare("SELECT 1 AS ok FROM vw_unidade LIMIT 1").get() !== undefined;
  } catch {
    bancoOk = false;
  }
  return {
    status: bancoOk ? "ok" : "erro",
    banco: bancoOk ? "ok" : "erro",
    agente: env.AGENT_MODE,
    langsmith: env.LANGSMITH_TRACING === "true" && Boolean(env.LANGSMITH_API_KEY),
  };
}
