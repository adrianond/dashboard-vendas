import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validarSql } from "@/lib/agent/sql/validator";

// Camada 3 de segurança (PRD da Etapa 2, seções 8 e 12). As queries aprovadas passam também pela
// regra 9 (prepare na conexão somente leitura, sem executar).

const blocosDoSchema = [...readFileSync("docs/schema.md", "utf8").matchAll(/```sql\r?\n([\s\S]*?)```/g)].map(
  (m, i): [string, string] => [`docs/schema.md, bloco ${i + 1}`, m[1].trim()],
);

const APROVADAS_EXTRAS: [string, string][] = [
  ["SELECT simples", "SELECT * FROM vw_venda LIMIT 10"],
  ["';' final", "SELECT count(*) FROM vw_venda;"],
  ["nome da view em maiúsculas", "SELECT count(*) FROM VW_VENDA"],
  [
    "CTE",
    "WITH totais AS (SELECT ano_mes_venda, sum(valor_final) AS receita FROM vw_venda_detalhada GROUP BY ano_mes_venda) SELECT * FROM totais ORDER BY receita DESC LIMIT 5",
  ],
  [
    "função de janela com PARTITION BY 1",
    "SELECT nome, row_number() OVER (PARTITION BY 1 ORDER BY nome) AS posicao FROM vw_unidade LIMIT 10",
  ],
  ["UNION entre views", "SELECT nome FROM vw_unidade UNION SELECT nome FROM vw_vendedor LIMIT 20"],
  [
    "subquery no WHERE",
    "SELECT nome FROM vw_vendedor WHERE unidade_id IN (SELECT id FROM vw_unidade WHERE ativo = 1) LIMIT 10",
  ],
  [
    "CASE, CAST e funções permitidas",
    "SELECT CASE WHEN valor_final > 100000 THEN 'alto' ELSE 'baixo' END AS faixa, CAST(round(avg(valor_final), 2) AS TEXT) AS media, strftime('%Y', data_venda) AS ano FROM vw_venda GROUP BY faixa, ano LIMIT 10",
  ],
  ["instrução dentro de comentário --", "SELECT count(*) FROM vw_venda -- ; DROP TABLE venda"],
  ["instrução dentro de comentário /* */", "SELECT count(*) FROM vw_venda /* ; DELETE FROM venda */"],
];

const APROVADAS = [...blocosDoSchema, ...APROVADAS_EXTRAS];

const PARSER = /parser não entendeu/;
const SO_SELECT = /apenas SELECT é permitido/;
const UMA_INSTRUCAO = /exatamente uma instrução/;

const REPROVADAS: [string, string, RegExp][] = [
  // Regra 1
  ["vazia", "", /query vazia/],
  ["só espaços", "   \n\t ", /query vazia/],
  ["longa demais", `SELECT count(*) FROM vw_venda WHERE 1 = 1 ${"AND 1 = 1 ".repeat(600)}`, /longa demais/],
  // Regra 2: o parser não entende (falha fechada)
  ["SQL inválido", "SELEC * FROM vw_venda", PARSER],
  ["SELECT incompleto", "SELECT FROM", PARSER],
  ["PRAGMA", "PRAGMA table_info(venda)", PARSER],
  ["VACUUM", "VACUUM", PARSER],
  ["REINDEX", "REINDEX", PARSER],
  ["ANALYZE", "ANALYZE", PARSER],
  ["BEGIN", "BEGIN", PARSER],
  ["COMMIT", "COMMIT", PARSER],
  ["SAVEPOINT", "SAVEPOINT s", PARSER],
  ["DETACH", "DETACH DATABASE x", PARSER],
  ["OVER sem PARTITION BY", "SELECT row_number() OVER (ORDER BY nome) FROM vw_unidade", /PARTITION BY 1/],
  ["OVER vazio", "SELECT count(*) OVER () FROM vw_unidade", /PARTITION BY 1/],
  // Regra 3
  ["duas instruções", "SELECT * FROM vw_venda; DROP TABLE venda", UMA_INSTRUCAO],
  ["dois SELECTs", "SELECT * FROM vw_venda; SELECT * FROM vw_unidade", UMA_INSTRUCAO],
  ["segunda instrução após comentário --", "SELECT * FROM vw_venda --\n; DROP TABLE venda", UMA_INSTRUCAO],
  ["segunda instrução após comentário /* */", "SELECT * FROM vw_venda /* x */; DROP TABLE venda", UMA_INSTRUCAO],
  // Regra 4
  ["INSERT", "INSERT INTO venda VALUES (1)", SO_SELECT],
  ["UPDATE", "UPDATE venda SET valor_final = 1", SO_SELECT],
  ["DELETE", "DELETE FROM venda", SO_SELECT],
  ["REPLACE", "REPLACE INTO venda VALUES (1)", SO_SELECT],
  ["CREATE", "CREATE TABLE t (a)", SO_SELECT],
  ["DROP", "DROP TABLE venda", SO_SELECT],
  ["ALTER", "ALTER TABLE venda ADD COLUMN b", SO_SELECT],
  ["ATTACH", "ATTACH DATABASE 'data/invasor.db' AS invasor", SO_SELECT],
  // Regra 5: cada tabela base, com a view sugerida
  ["tabela base unidade", "SELECT * FROM unidade", /tabela não permitida: unidade; use vw_unidade/],
  ["tabela base vendedor", "SELECT * FROM vendedor", /tabela não permitida: vendedor; use vw_vendedor/],
  ["tabela base cliente", "SELECT nome, documento FROM cliente", /tabela não permitida: cliente; use vw_cliente/],
  ["tabela base produto", "SELECT * FROM produto", /tabela não permitida: produto; use vw_produto/],
  ["tabela base proposta", "SELECT observacao FROM proposta", /tabela não permitida: proposta; use vw_proposta/],
  ["tabela base venda", "SELECT * FROM venda", /tabela não permitida: venda; use vw_venda/],
  ["tabela base meta_vendedor", "SELECT * FROM meta_vendedor", /tabela não permitida: meta_vendedor; use vw_meta_vendedor/],
  ["tabela base em maiúsculas", "SELECT * FROM CLIENTE", /tabela não permitida: cliente/],
  ["tabela base em subquery", "SELECT * FROM vw_venda WHERE id IN (SELECT id FROM venda)", /tabela não permitida: venda/],
  ["tabela base em JOIN", "SELECT * FROM vw_venda v JOIN cliente c ON c.id = v.id", /tabela não permitida: cliente/],
  ["tabela base em UNION", "SELECT nome FROM vw_unidade UNION SELECT cpf FROM vendedor", /tabela não permitida: vendedor/],
  ["tabela base no corpo de CTE", "WITH x AS (SELECT * FROM cliente) SELECT * FROM x", /tabela não permitida: cliente/],
  [
    "CTE de mesmo nome em outro escopo",
    "SELECT * FROM (WITH cliente AS (SELECT 1 AS a) SELECT * FROM cliente) s, cliente",
    /tabela não permitida: cliente/,
  ],
  ["view inexistente", "SELECT * FROM vw_inexistente", /tabela não permitida: vw_inexistente; use apenas as views/],
  ["schema main", "SELECT * FROM main.vw_venda", /não qualifique tabelas com schema/],
  ["schema temp", "SELECT * FROM temp.vw_venda", /não qualifique tabelas com schema/],
  ["sqlite_master", "SELECT sql FROM sqlite_master", /tabela de sistema não permitida: sqlite_master/],
  ["sqlite_schema em subquery", "SELECT * FROM (SELECT * FROM sqlite_schema)", /tabela de sistema não permitida: sqlite_schema/],
  ["sqlite_temp_master", "SELECT * FROM sqlite_temp_master", /tabela de sistema não permitida/],
  ["sqlite_sequence", "SELECT * FROM sqlite_sequence", /tabela de sistema não permitida/],
  // Regra 6
  ["pragma_table_info", "SELECT * FROM pragma_table_info('cliente')", /função de tabela não permitida: pragma_table_info/],
  ["pragma_* em subquery", "SELECT * FROM vw_venda WHERE id IN (SELECT cid FROM pragma_table_info('venda'))", /pragma_table_info/],
  // Regra 7
  ["load_extension", "SELECT load_extension('malicioso')", /função não permitida: load_extension/],
  ["randomblob", "SELECT randomblob(1000000000) FROM vw_venda", /função não permitida: randomblob/],
  ["zeroblob", "SELECT zeroblob(1000000000)", /função não permitida: zeroblob/],
  ["sqlite_version", "SELECT sqlite_version()", /função não permitida: sqlite_version/],
  ["json_each no FROM", "SELECT * FROM json_each('[1,2]')", /função não permitida: json_each/],
  ["função proibida no ORDER BY", "SELECT * FROM vw_venda ORDER BY random() LIMIT 1", /função não permitida: random/],
  // Regra 8
  [
    "WITH RECURSIVE",
    "WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r) SELECT n FROM r",
    /CTE recursiva não permitida: r/,
  ],
  [
    "CTE autorreferente sem RECURSIVE",
    "WITH r AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM r) SELECT n FROM r",
    /CTE recursiva não permitida: r/,
  ],
  // Regra 9
  ["coluna inexistente", "SELECT coluna_inexistente FROM vw_venda", /erro do SQLite ao preparar/],
];

describe("validarSql: queries aprovadas", () => {
  it("tem ao menos 15 casos, incluindo os 17 blocos do docs/schema.md", () => {
    expect(blocosDoSchema).toHaveLength(17);
    expect(APROVADAS.length).toBeGreaterThanOrEqual(15);
  });

  it.each(APROVADAS)("%s", (_nome, sql) => {
    const resultado = validarSql(sql);
    expect(resultado).toMatchObject({ ok: true });
    if (!resultado.ok) return;
    expect(resultado.sqlNormalizado).not.toMatch(/--|\/\*|;\s*$/);
    expect(resultado.sqlNormalizado).toBe(resultado.sqlNormalizado.trim());
  });

  it("remove do sqlNormalizado a instrução que estava dentro do comentário", () => {
    const resultado = validarSql("SELECT count(*) FROM vw_venda /* ; DELETE FROM venda */ -- ; DROP TABLE venda");
    expect(resultado).toEqual({ ok: true, sqlNormalizado: expect.not.stringMatching(/DELETE|DROP/i) });
  });
});

describe("validarSql: casos adversariais", () => {
  it("tem ao menos 25 casos", () => {
    expect(REPROVADAS.length).toBeGreaterThanOrEqual(25);
  });

  it.each(REPROVADAS)("%s", (_nome, sql, motivoEsperado) => {
    const resultado = validarSql(sql);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.motivo).toMatch(motivoEsperado);
  });

  it("regra 9: reprova se o SQLite disser que a instrução não é somente leitura", () => {
    const resultado = validarSql("SELECT * FROM vw_venda", () => ({ readonly: false }));
    expect(resultado).toEqual({ ok: false, motivo: expect.stringMatching(/não é somente leitura/) });
  });

  it("regra 9: prepara o sqlNormalizado (sem comentário e sem ';')", () => {
    const preparadas: string[] = [];
    validarSql("SELECT * FROM vw_venda; -- fim", (sql) => {
      preparadas.push(sql);
      return { readonly: true };
    });
    expect(preparadas).toEqual(['SELECT * FROM "vw_venda"']);
  });
});
