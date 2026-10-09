import path from "node:path";
import Database from "better-sqlite3";
import { env } from "../env";

// Conexão SOMENTE LEITURA: a ÚNICA que o agente (src/lib/agent) pode usar
// (CLAUDE.md, seção 4; PRD, seção 14, camada 1). Duas travas independentes:
//  1. o arquivo é aberto com readonly: true, e o próprio SQLite recusa qualquer escrita;
//  2. PRAGMA query_only = ON.
// O journal_mode não é definido aqui (seria uma escrita): o modo WAL fica gravado no arquivo
// pelo client.ts, e esta conexão o herda.
// Devolve o better-sqlite3 cru (sem Drizzle): o agente executa SQL validado e, na Etapa 2,
// confere statement.readonly antes de executar.

function criarConexaoLeitura() {
  const sqlite = new Database(path.resolve(env.DATABASE_PATH), {
    readonly: true,
    fileMustExist: true,
  });
  sqlite.pragma("query_only = ON");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

const globalParaDb = globalThis as unknown as { dbLeitura?: Database.Database };

export const readonlyDb = globalParaDb.dbLeitura ?? criarConexaoLeitura();
if (process.env.NODE_ENV !== "production") globalParaDb.dbLeitura = readonlyDb;
