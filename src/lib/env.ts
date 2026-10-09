import { config } from "dotenv";
import { z } from "zod";

// Fonte única de configuração: o mesmo .env.local usado pelo Next.js.
// Não sobrescreve variáveis que já estejam definidas no ambiente.
config({ path: ".env.local", quiet: true });

const envSchema = z.object({
  DATABASE_PATH: z.string().min(1),
  // Usadas a partir da Etapa 2
  LANGSMITH_TRACING: z.enum(["true", "false"]).optional(),
  LANGSMITH_API_KEY: z.string().optional(),
  LANGSMITH_PROJECT: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // A mensagem traz só os nomes e os problemas das variáveis, nunca os valores.
  throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;
