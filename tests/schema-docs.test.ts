import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readonlyDb } from "@/lib/db/readonly-client";
import { ALLOWED_VIEWS } from "@/lib/db/views";

// Critério de aceite 7: todo bloco ```sql de docs/schema.md executa pela conexão somente
// leitura e retorna dados. É o material que vai para o prompt do LLM na Etapa 2.
const documento = readFileSync("docs/schema.md", "utf8");
const blocos = [...documento.matchAll(/```sql\r?\n([\s\S]*?)```/g)].map((m, i) => ({
  n: i + 1,
  sql: m[1].trim(),
}));

const objetosConsultados = (sql: string) =>
  [...sql.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)/gi)].map((m) => m[1]);

describe("docs/schema.md", () => {
  it("tem os 7 JOINs de relacionamento e os 10 exemplos", () => {
    expect(blocos).toHaveLength(17);
  });

  it.each(blocos)("bloco $n executa pela conexão somente leitura e retorna dados", ({ sql }) => {
    const consulta = readonlyDb.prepare(sql);
    expect(consulta.readonly).toBe(true);
    expect(consulta.all().length).toBeGreaterThan(0);
  });

  it.each(blocos)("bloco $n consulta só views de ALLOWED_VIEWS", ({ sql }) => {
    const fora = objetosConsultados(sql).filter((o) => !(ALLOWED_VIEWS as readonly string[]).includes(o));
    expect(fora).toEqual([]);
  });

  it.each(blocos)("bloco $n tem LIMIT de no máximo 500", ({ sql }) => {
    const limite = sql.match(/\bLIMIT\s+(\d+)/i);
    expect(limite).not.toBeNull();
    expect(Number(limite![1])).toBeLessThanOrEqual(500);
  });
});
