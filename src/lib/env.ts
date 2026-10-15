import { config } from "dotenv";
import { z } from "zod";

// Fonte única de configuração: o mesmo .env.local usado pelo Next.js.
// Não sobrescreve variáveis que já estejam definidas no ambiente.
config({ path: ".env.local", quiet: true });

// "VAR=" (texto vazio) conta como não definida, para as chaves vazias do .env.example.
const vazioComoAusente = (valor: unknown) => (valor === "" ? undefined : valor);
const texto = () => z.preprocess(vazioComoAusente, z.string().min(1).optional());
const inteiro = (padrao: number) => z.preprocess(vazioComoAusente, z.coerce.number().int().positive().default(padrao));

const envSchema = z.object({
  DATABASE_PATH: z.string().min(1),

  // Anthropic (a chave só é exigida quando um modelo real é criado: src/lib/agent/models.ts)
  ANTHROPIC_API_KEY: texto(),
  ANTHROPIC_MODEL_RAPIDO: z.preprocess(vazioComoAusente, z.string().default("claude-haiku-5-5")),
  ANTHROPIC_MODEL_PRINCIPAL: z.preprocess(vazioComoAusente, z.string().default("claude-sonnet-5-5")),

  // LangSmith (sem a chave, o agente funciona sem rastreamento)
  LANGSMITH_TRACING: z.preprocess(vazioComoAusente, z.enum(["true", "false"]).optional()),
  LANGSMITH_API_KEY: texto(),
  LANGSMITH_PROJECT: texto(),

  // Agente: limites e parâmetros (PRD da Etapa 2, seção 7.4)
  DATA_REFERENCIA: z.preprocess(
    vazioComoAusente,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD").default("2026-09-30"),
  ),
  AGENT_MAX_PERGUNTA_CHARS: inteiro(500),
  AGENT_MAX_TENTATIVAS: inteiro(3),
  AGENT_MAX_LINHAS: inteiro(500),
  AGENT_MAX_LINHAS_RESPOSTA: inteiro(50),
  AGENT_MAX_RESULTADO_CHARS: inteiro(20000),
  AGENT_TIMEOUT_MS: inteiro(5000),
  AGENT_MAX_HISTORICO: inteiro(5),
  AGENT_MAX_TOKENS_CLASSIFICACAO: inteiro(300),
  AGENT_MAX_TOKENS_SQL: inteiro(1000),
  AGENT_MAX_TOKENS_RESPOSTA: inteiro(800),

  // Testes com LLM real (têm custo)
  RUN_LLM_TESTS: z.preprocess(vazioComoAusente, z.enum(["0", "1"]).default("0")),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // A mensagem traz só os nomes e os problemas das variáveis, nunca os valores.
  throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;
