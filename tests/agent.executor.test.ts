import { describe, expect, it } from "vitest";
import { configPadrao, criarConfig } from "@/lib/agent/config";
import { criarExecutor, resumirParaLlm, type ResultadoSql } from "@/lib/agent/sql/executor";
import { readonlyDb } from "@/lib/db/readonly-client";

// Camada 4 de segurança (PRD da Etapa 2, seções 9 e 12). Cada execução sobe um processo filho
// (~300 ms), por isso os testes têm prazo maior que o padrão do vitest.
const PRAZO_TESTE_MS = 15_000;

const executor = criarExecutor(criarConfig({ maxLinhas: 5 }));

function fotografarBanco() {
  return readonlyDb
    .prepare(
      `SELECT (SELECT count(*) FROM venda) AS vendas, (SELECT count(*) FROM proposta) AS propostas,
              (SELECT sum(valor_final) FROM venda) AS soma_valor_final, (SELECT count(*) FROM sqlite_master) AS objetos`,
    )
    .get();
}

describe("executor: limite de linhas", () => {
  it("aplica o LIMIT (máximo + 1) e marca truncado", { timeout: PRAZO_TESTE_MS }, async () => {
    const resultado = await executor.executar("SELECT id FROM vw_venda ORDER BY id");
    expect(resultado).toMatchObject({
      ok: true,
      sqlExecutado: "SELECT * FROM (SELECT id FROM vw_venda ORDER BY id) LIMIT 6",
      colunas: ["id"],
      truncado: true,
    });
    if (resultado.ok) expect(resultado.linhas).toHaveLength(5);
  });

  it("não marca truncado quando o resultado cabe no limite", { timeout: PRAZO_TESTE_MS }, async () => {
    const resultado = await executor.executar("SELECT id FROM vw_venda ORDER BY id LIMIT 5");
    expect(resultado).toMatchObject({ ok: true, truncado: false });
    if (resultado.ok) expect(resultado.linhas).toHaveLength(5);
  });

  it("resultado vazio mantém as colunas", { timeout: PRAZO_TESTE_MS }, async () => {
    const resultado = await executor.executar("SELECT id, valor_final FROM vw_venda WHERE 1 = 0");
    expect(resultado).toMatchObject({ ok: true, colunas: ["id", "valor_final"], linhas: [], truncado: false });
  });
});

describe("executor: tipos e erros", () => {
  it("converte BigInt: número quando cabe sem perda, texto quando não cabe", { timeout: PRAZO_TESTE_MS }, async () => {
    const resultado = await executor.executar("SELECT 9007199254740993 AS grande, 42 AS pequeno, 1.5 AS real");
    expect(resultado).toMatchObject({ ok: true, linhas: [{ grande: "9007199254740993", pequeno: 42, real: 1.5 }] });
  });

  it("erro do SQLite vira resultado com ok: false (sem exceção)", { timeout: PRAZO_TESTE_MS }, async () => {
    const resultado = await executor.executar("SELECT coluna_inexistente FROM vw_venda");
    expect(resultado).toMatchObject({ ok: false, erro: expect.stringMatching(/no such column/) });
  });
});

describe("executor: defesa em profundidade (sem passar pelo validador)", () => {
  const antes = fotografarBanco();

  it.each([
    ["INSERT direto", "INSERT INTO venda (proposta_id, data_venda, valor_final, numero_nota_fiscal) VALUES (1, '2026-01-01', 1, 'X')"],
    ["DELETE direto", "DELETE FROM venda"],
    ["quebra do envoltório com ';'", "SELECT 1) ; DELETE FROM venda; SELECT (1"],
    ["ATTACH direto", "ATTACH DATABASE 'data/invasor.db' AS invasor"],
  ])("%s falha", { timeout: PRAZO_TESTE_MS }, async (_nome, sql) => {
    expect(await executor.executar(sql)).toMatchObject({ ok: false });
  });

  it("o banco permanece idêntico", () => {
    expect(fotografarBanco()).toEqual(antes);
  });
});

describe("executor: timeout", () => {
  const timeoutMs = configPadrao.timeoutMs;

  it(
    "interrompe query cara e termina em menos de 2× o timeout",
    { timeout: timeoutMs * 3 + PRAZO_TESTE_MS },
    async () => {
      const inicio = Date.now();
      const resultado = await criarExecutor(configPadrao).executar(
        "SELECT count(*) AS n FROM vw_venda a, vw_venda b, vw_venda c",
      );
      const duracao = Date.now() - inicio;

      expect(resultado).toMatchObject({ ok: false, erro: expect.stringMatching(/tempo limite.*simplifique/) });
      expect(duracao).toBeLessThan(2 * timeoutMs);
    },
  );

  it("o executor continua funcionando depois de um timeout", { timeout: PRAZO_TESTE_MS }, async () => {
    expect(await executor.executar("SELECT count(*) AS n FROM vw_venda")).toMatchObject({ ok: true });
  });
});

describe("resumirParaLlm", () => {
  const resultado = (linhas: Record<string, unknown>[], truncado = false): ResultadoSql => ({
    sqlExecutado: "SELECT ...",
    colunas: Object.keys(linhas[0] ?? {}),
    linhas,
    truncado,
  });
  const muitas = Array.from({ length: 100 }, (_, i) => ({ id: i, nome: `item ${i}` }));

  it("envia no máximo maxLinhasResposta linhas e informa as restantes", () => {
    const resumo = JSON.parse(resumirParaLlm(resultado(muitas, true), { maxLinhasResposta: 10, maxResultadoChars: 100_000 }));
    expect(resumo.linhas).toHaveLength(10);
    expect(resumo).toMatchObject({ colunas: ["id", "nome"], linhasNaoEnviadas: 90, resultadoTruncadoNoBanco: true });
  });

  it("corta textos longos", () => {
    const resumo = JSON.parse(
      resumirParaLlm(resultado([{ texto: "x".repeat(1000) }]), { maxLinhasResposta: 10, maxResultadoChars: 100_000 }),
    );
    expect(resumo.linhas[0].texto).toBe(`${"x".repeat(200)}…`);
  });

  it("respeita maxResultadoChars descartando linhas do fim", () => {
    const json = resumirParaLlm(resultado(muitas), { maxLinhasResposta: 100, maxResultadoChars: 500 });
    expect(json.length).toBeLessThanOrEqual(500);
    const resumo = JSON.parse(json);
    expect(resumo.linhas.length).toBeGreaterThan(0);
    expect(resumo.linhasNaoEnviadas).toBe(100 - resumo.linhas.length);
  });
});
