import { describe, expect, it } from "vitest";
import { REGRAS } from "@/lib/db/check";
import { readonlyDb } from "@/lib/db/readonly-client";

// As mesmas regras do db:check, uma por teste: se falhar, o vitest mostra até 3 linhas violadoras.
describe("integridade dos dados (critério de aceite 5)", () => {
  it.each(REGRAS)("$regra", ({ sql }) => {
    const linhas = readonlyDb.prepare(sql).all();
    expect({ violacoes: linhas.length, exemplos: linhas.slice(0, 3) }).toEqual({ violacoes: 0, exemplos: [] });
  });
});
