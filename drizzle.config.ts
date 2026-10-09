import { defineConfig } from "drizzle-kit";
// Reaproveita a validação de env.ts, que carrega o mesmo .env.local do Next.js.
import { env } from "./src/lib/env";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: env.DATABASE_PATH },
  strict: true,
  verbose: true,
});
