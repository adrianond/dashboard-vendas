import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { env } from "../env";
import type { ConfigAgente } from "./config";
import { CATEGORIAS_CLASSIFICADOR } from "./state";

// Modelos do agente (PRD da Etapa 2, seção 4.1). Os nós dependem só da interface ModelosAgente,
// para que os testes injetem modelos falsos sem chamar a API.

export const esquemaClassificacao = z.object({
  categoria: z.enum(CATEGORIAS_CLASSIFICADOR).describe("Categoria da pergunta atual"),
  motivo: z.string().describe("Justificativa em uma frase curta, em português"),
});

export const esquemaSql = z.object({
  sql: z
    .string()
    .nullable()
    .describe("Uma única consulta SQLite (SELECT ou WITH … SELECT), ou null se a pergunta não puder ser respondida"),
  raciocinio: z.string().describe("No máximo duas frases sobre as escolhas feitas (ou o motivo do null)"),
});

export type Classificacao = z.infer<typeof esquemaClassificacao>;
export type SqlGerado = z.infer<typeof esquemaSql>;

export interface ModelosAgente {
  classificar(mensagens: BaseMessage[]): Promise<Classificacao>;
  // Usado tanto para gerar quanto para corrigir SQL.
  escreverSql(mensagens: BaseMessage[]): Promise<SqlGerado>;
  responder(mensagens: BaseMessage[]): Promise<string>;
}

type OpcoesChat = NonNullable<ConstructorParameters<typeof ChatAnthropic>[0]>;
type Raciocinio = NonNullable<OpcoesChat["thinking"]>;
type Esforco = NonNullable<NonNullable<OpcoesChat["outputConfig"]>["effort"]>;

// Haiku 5.5 aceita desligar o raciocínio. O Sonnet 5.5 rejeita "disabled" (400); "between_tools"
// (só pensa entre chamadas de ferramenta, que o agente não usa) é a forma de desligá-lo. O tipo do
// SDK ainda não conhece esse valor; o LangChain repassa o thinking explícito sem alterá-lo.
const SEM_RACIOCINIO: Raciocinio = { type: "disabled" };
const RACIOCINIO_SO_ENTRE_FERRAMENTAS = { type: "between_tools" } as unknown as Raciocinio;

function criarChat(modelo: string, maxTokens: number, thinking: Raciocinio, effort: Esforco): ChatAnthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY não está definida em .env.local: necessária para usar os modelos reais.");
  }
  // Sem temperature: os modelos 5.5 rejeitam valores de amostragem diferentes do padrão.
  return new ChatAnthropic({ model: modelo, apiKey: env.ANTHROPIC_API_KEY, maxTokens, thinking, outputConfig: { effort } });
}

export function criarModelosAnthropic(config: Pick<ConfigAgente, "modelos" | "maxTokens">): ModelosAgente {
  const { modelos, maxTokens } = config;
  // Saída estruturada por JSON schema (output_config.format): o Sonnet 5.5 rejeita tool_choice forçado.
  const classificador = criarChat(modelos.rapido, maxTokens.classificacao, SEM_RACIOCINIO, "low").withStructuredOutput(
    esquemaClassificacao,
    { method: "jsonSchema", name: "classificacao" },
  );
  const escritorSql = criarChat(
    modelos.principal,
    maxTokens.sql,
    RACIOCINIO_SO_ENTRE_FERRAMENTAS,
    "medium",
  ).withStructuredOutput(esquemaSql, { method: "jsonSchema", name: "consulta_sql" });
  const redator = criarChat(modelos.principal, maxTokens.resposta, RACIOCINIO_SO_ENTRE_FERRAMENTAS, "low");

  return {
    classificar: (mensagens) => classificador.invoke(mensagens),
    escreverSql: (mensagens) => escritorSql.invoke(mensagens),
    responder: async (mensagens) => (await redator.invoke(mensagens)).text,
  };
}
