import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { env } from "../env";
import * as schema from "./schema";

// Conexão de LEITURA E ESCRITA: usada só por migrations, seed, scripts e testes.
// O código do agente (src/lib/agent) NUNCA importa este arquivo; ele usa readonly-client.ts.

function criarConexao() {
  const arquivo = path.resolve(env.DATABASE_PATH);
  mkdirSync(path.dirname(arquivo), { recursive: true });

  const sqlite = new Database(arquivo);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  return drizzle({ client: sqlite, schema });
}

// Em desenvolvimento, o hot reload do Next.js reavalia os módulos; o cache em globalThis
// evita abrir uma conexão nova a cada recarga.
const globalParaDb = globalThis as unknown as { dbEscrita?: ReturnType<typeof criarConexao> };

export const db = globalParaDb.dbEscrita ?? criarConexao();
if (process.env.NODE_ENV !== "production") globalParaDb.dbEscrita = db;

// Acesso direto ao better-sqlite3 (PRAGMAs, SQL cru em scripts e testes).
export const sqlite = db.$client;
