import { describe, expect, it } from "vitest";
import { readonlyDb } from "@/lib/db/readonly-client";
import { ALLOWED_VIEWS, EXCLUDED_COLUMNS } from "@/lib/db/views";

// Camada 2 de segurança (PRD, seções 6.5 e 14; critério de aceite 9). Lê pela conexão
// somente leitura, como o agente fará.

const TABELAS_BASE = ["unidade", "vendedor", "cliente", "produto", "proposta", "venda", "meta_vendedor"];

// Colunas que nenhuma view pode expor, nem com prefixo (ex.: cliente_email).
const PROIBIDAS = [
  "cpf", "cnpj", "documento", "email", "telefone", "logradouro", "numero", "bairro", "cep",
  "data_nascimento", "observacao", "numero_nota_fiscal",
];

const ANALITICAS_COM_CLIENTE = ["vw_venda_detalhada", "vw_proposta_detalhada"];

const colunas = (objeto: string) =>
  (readonlyDb.pragma(`table_info(${objeto})`) as { name: string }[]).map((c) => c.name);
const valor = (sql: string) => (readonlyDb.prepare(sql).get() as { n: number }).n;
const plano = (sql: string) =>
  (readonlyDb.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[]).map((l) => l.detail);
const varreSemIndice = (linha: string) => linha.startsWith("SCAN ") && !linha.includes("INDEX");

describe("views do LLM: existência e exposição de dados", () => {
  it("as views do banco são exatamente ALLOWED_VIEWS", () => {
    const views = (
      readonlyDb.prepare("SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name").all() as { name: string }[]
    ).map((v) => v.name);
    expect(views).toEqual([...ALLOWED_VIEWS].sort());
  });

  it.each(ALLOWED_VIEWS)("%s retorna dados", (view) => {
    expect(valor(`SELECT count(*) AS n FROM ${view}`)).toBeGreaterThan(0);
  });

  it.each(ALLOWED_VIEWS)("%s não expõe colunas removidas", (view) => {
    const expostas = colunas(view).filter((c) => PROIBIDAS.some((p) => c === p || c.endsWith(`_${p}`)));
    expect(expostas).toEqual([]);
  });

  it("vw_cliente não expõe o nome (só razao_social, quando PJ)", () => {
    expect(colunas("vw_cliente")).not.toContain("nome");
  });

  it("razão social é NULL para todo PF e faixa etária é NULL para todo PJ", () => {
    expect(valor("SELECT count(*) AS n FROM vw_cliente WHERE tipo_pessoa = 'PF' AND razao_social IS NOT NULL")).toBe(0);
    expect(valor("SELECT count(*) AS n FROM vw_cliente WHERE tipo_pessoa = 'PJ' AND faixa_etaria IS NOT NULL")).toBe(0);
    for (const view of ANALITICAS_COM_CLIENTE) {
      expect(
        valor(`SELECT count(*) AS n FROM ${view} WHERE cliente_tipo_pessoa = 'PF' AND cliente_razao_social IS NOT NULL`),
        view,
      ).toBe(0);
      expect(
        valor(`SELECT count(*) AS n FROM ${view} WHERE cliente_tipo_pessoa = 'PJ' AND cliente_faixa_etaria IS NOT NULL`),
        view,
      ).toBe(0);
    }
  });
});

describe("views do LLM: completude", () => {
  it.each(TABELAS_BASE)("toda coluna de %s está na view correspondente ou em EXCLUDED_COLUMNS", (tabela) => {
    const daView = new Set(colunas(`vw_${tabela}`));
    const semDecisao = colunas(tabela).filter((c) => !daView.has(c) && !(`${tabela}.${c}` in EXCLUDED_COLUMNS));
    expect(semDecisao).toEqual([]);
  });

  it("EXCLUDED_COLUMNS só cita colunas que existem", () => {
    const inexistentes = Object.keys(EXCLUDED_COLUMNS).filter((chave) => {
      const [tabela, coluna] = chave.split(".");
      return !colunas(tabela).includes(coluna);
    });
    expect(inexistentes).toEqual([]);
  });
});

describe("views do LLM: consistência com as tabelas base", () => {
  it("vw_venda_detalhada = venda (quantidade e soma de valor_final)", () => {
    const sql = "SELECT count(*) AS quantidade, round(sum(valor_final), 2) AS soma FROM";
    expect(readonlyDb.prepare(`${sql} vw_venda_detalhada`).get()).toEqual(readonlyDb.prepare(`${sql} venda`).get());
  });

  it("vw_proposta_detalhada = proposta (quantidade por status)", () => {
    const sql = (origem: string) => `SELECT status, count(*) AS quantidade FROM ${origem} GROUP BY status ORDER BY status`;
    expect(readonlyDb.prepare(sql("vw_proposta_detalhada")).all()).toEqual(readonlyDb.prepare(sql("proposta")).all());
  });

  it("vw_desempenho_vendedor_mes confere com um cálculo independente", () => {
    expect(valor("SELECT count(*) AS n FROM vw_desempenho_vendedor_mes")).toBe(
      valor("SELECT count(*) AS n FROM meta_vendedor"),
    );

    // Realizado calculado direto nas tabelas base, pelo mês da data_venda.
    const independente = `
      SELECT m.vendedor_id, m.ano, m.mes,
        (SELECT count(*) FROM venda v JOIN proposta p ON p.id = v.proposta_id
          WHERE p.vendedor_id = m.vendedor_id
            AND strftime('%Y-%m', v.data_venda) = printf('%04d-%02d', m.ano, m.mes)) AS qtd,
        (SELECT round(coalesce(sum(v.valor_final), 0), 2) FROM venda v JOIN proposta p ON p.id = v.proposta_id
          WHERE p.vendedor_id = m.vendedor_id
            AND strftime('%Y-%m', v.data_venda) = printf('%04d-%02d', m.ano, m.mes)) AS valor
      FROM meta_vendedor m`;
    const daView = "SELECT vendedor_id, ano, mes, qtd_vendida, valor_vendido FROM vw_desempenho_vendedor_mes";

    expect(readonlyDb.prepare(`${independente} EXCEPT ${daView}`).all()).toEqual([]);
    expect(readonlyDb.prepare(`${daView} EXCEPT ${independente}`).all()).toEqual([]);
  });
});

describe("views do LLM: desempenho e regras de construção", () => {
  it("filtro por data em vw_venda_detalhada usa o índice de data_venda", () => {
    const linhas = plano(
      "SELECT venda_id, valor_final FROM vw_venda_detalhada WHERE data_venda BETWEEN '2025-01-01' AND '2025-01-31'",
    );
    expect(linhas.join("\n")).toMatch(/USING INDEX venda_data_venda_idx/);
    expect(linhas.filter(varreSemIndice)).toEqual([]);
  });

  it("JOIN vw_proposta × vw_vendedor não varre a tabela proposta sem índice", () => {
    const linhas = plano("SELECT p.id, v.nome FROM vw_proposta p JOIN vw_vendedor v ON v.id = p.vendedor_id");
    expect(linhas.join("\n")).toMatch(/proposta_vendedor_id_idx/);
    expect(linhas.filter((l) => l.includes("proposta") && varreSemIndice(l))).toEqual([]);
  });

  it("nenhuma trigger existe no banco", () => {
    expect(valor("SELECT count(*) AS n FROM sqlite_master WHERE type = 'trigger'")).toBe(0);
  });

  it.each(ALLOWED_VIEWS)("%s é construída só sobre tabelas base", (view) => {
    const { sql } = readonlyDb.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(view) as { sql: string };
    const corpo = sql.replace(`CREATE VIEW ${view}`, "");
    expect(corpo).not.toMatch(/\bvw_/);
  });
});
