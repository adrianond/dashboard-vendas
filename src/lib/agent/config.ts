import { env } from "../env";

// Limites e parâmetros do agente (PRD da Etapa 2, seção 7.4). Os valores vêm do env (com padrões);
// os testes ajustam o que precisarem com criarConfig().
export type ConfigAgente = {
  maxPerguntaChars: number;
  maxTentativas: number;
  maxLinhas: number;
  maxLinhasResposta: number;
  maxResultadoChars: number;
  timeoutMs: number;
  maxHistorico: number;
  maxTokens: { classificacao: number; sql: number; resposta: number };
  dataReferencia: string;
  modelos: { rapido: string; principal: string };
};

export const configPadrao: ConfigAgente = {
  maxPerguntaChars: env.AGENT_MAX_PERGUNTA_CHARS,
  maxTentativas: env.AGENT_MAX_TENTATIVAS,
  maxLinhas: env.AGENT_MAX_LINHAS,
  maxLinhasResposta: env.AGENT_MAX_LINHAS_RESPOSTA,
  maxResultadoChars: env.AGENT_MAX_RESULTADO_CHARS,
  timeoutMs: env.AGENT_TIMEOUT_MS,
  maxHistorico: env.AGENT_MAX_HISTORICO,
  maxTokens: {
    classificacao: env.AGENT_MAX_TOKENS_CLASSIFICACAO,
    sql: env.AGENT_MAX_TOKENS_SQL,
    resposta: env.AGENT_MAX_TOKENS_RESPOSTA,
  },
  dataReferencia: env.DATA_REFERENCIA,
  modelos: { rapido: env.ANTHROPIC_MODEL_RAPIDO, principal: env.ANTHROPIC_MODEL_PRINCIPAL },
};

export type AjustesConfig = Partial<Omit<ConfigAgente, "maxTokens" | "modelos">> & {
  maxTokens?: Partial<ConfigAgente["maxTokens"]>;
  modelos?: Partial<ConfigAgente["modelos"]>;
};

export function criarConfig(ajustes: AjustesConfig = {}): ConfigAgente {
  return {
    ...configPadrao,
    ...ajustes,
    maxTokens: { ...configPadrao.maxTokens, ...ajustes.maxTokens },
    modelos: { ...configPadrao.modelos, ...ajustes.modelos },
  };
}
