import { readFileSync } from "node:fs";
import path from "node:path";

// O schema enviado ao LLM vem exclusivamente de docs/schema.md, que só descreve as views vw_*
// (CLAUDE.md, seção 4). Caminho relativo à raiz do projeto: o Next.js, os scripts tsx e o
// `langgraph dev` rodam a partir dela.
const ARQUIVO_SCHEMA = path.join(process.cwd(), "docs", "schema.md");

let schemaEmCache: string | undefined;

export function carregarSchema(): string {
  if (schemaEmCache === undefined) {
    try {
      schemaEmCache = readFileSync(ARQUIVO_SCHEMA, "utf8").trim();
    } catch (erro) {
      throw new Error(`Não foi possível ler ${ARQUIVO_SCHEMA} (schema das views para o prompt).`, { cause: erro });
    }
  }
  return schemaEmCache;
}
