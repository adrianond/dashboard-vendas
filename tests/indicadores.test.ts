import { describe, expect, it } from "vitest";
import { readonlyDb } from "@/lib/db/readonly-client";
import { env } from "@/lib/env";
import {
  CATEGORIAS_POR_TIPO,
  COLUNAS_PROPOSTA,
  COLUNAS_VENDA,
  REGIOES,
  TIPOS_VEICULO,
  lerFiltros,
  montarWhere,
  somarMeses,
  type Filtros,
} from "@/lib/indicadores/filtros";

// Camada de indicadores (PRD da Etapa 3, seção 6). Lê pela conexão somente leitura, como a camada.

function filtrosValidos(entrada: Record<string, string | undefined>): Filtros {
  const leitura = lerFiltros(entrada);
  if (!leitura.ok) throw new Error(`filtros recusados: ${leitura.mensagens.join("; ")}`);
  return leitura.filtros;
}

function mensagensDe(entrada: Record<string, string | undefined>): string[] {
  const leitura = lerFiltros(entrada);
  return leitura.ok ? [] : leitura.mensagens;
}

const contar = (sql: string, params: object = {}) => (readonlyDb.prepare(sql).get(params) as { n: number }).n;

describe("filtros: valores padrão", () => {
  it("sem parâmetros, o período são os 12 meses completos até a DATA_REFERENCIA", () => {
    const filtros = filtrosValidos({});
    expect(filtros.fim).toBe(env.DATA_REFERENCIA);
    expect(filtros.inicio).toBe(somarMeses(`${env.DATA_REFERENCIA.slice(0, 7)}-01`, -11));
  });

  it("o início padrão acompanha o fim informado", () => {
    expect(filtrosValidos({ fim: "2026-09-30" }).inicio).toBe("2025-10-01");
    expect(filtrosValidos({ fim: "2026-03-15" }).inicio).toBe("2025-04-01");
  });

  it("texto vazio conta como filtro ausente", () => {
    expect(filtrosValidos({ regiao: "", unidadeId: "", fim: "2026-09-30" })).toEqual({ inicio: "2025-10-01", fim: "2026-09-30" });
  });

  it("aceita URLSearchParams e converte unidadeId para número", () => {
    const leitura = lerFiltros(new URLSearchParams("inicio=2026-01-01&fim=2026-06-30&unidadeId=1&regiao=SUL"));
    expect(leitura).toMatchObject({ ok: true, filtros: { unidadeId: 1, regiao: "SUL" } });
  });
});

describe("filtros: validação", () => {
  it.each([
    ["formato errado", { inicio: "01/01/2026" }, "inicio"],
    ["data inexistente", { inicio: "2026-02-30" }, "inicio"],
    ["fim anterior ao início", { inicio: "2026-06-01", fim: "2026-05-31" }, "fim"],
    ["mais de 36 meses", { inicio: "2023-09-30", fim: "2026-09-30" }, "36 meses"],
    ["unidade inexistente", { unidadeId: "999999" }, "unidade não encontrada"],
    ["unidade não numérica", { unidadeId: "1 OR 1=1" }, "unidadeId"],
    ["unidade zero", { unidadeId: "0" }, "unidadeId"],
    ["região inválida", { regiao: "LESTE" }, "regiao"],
    ["tipo inválido", { tipoVeiculo: "BARCO" }, "tipoVeiculo"],
    ["categoria inválida", { categoria: "JIPE" }, "categoria"],
    ["categoria incompatível com o tipo", { tipoVeiculo: "MOTO", categoria: "SUV" }, "incompatível"],
    ["parâmetro desconhecido", { ordem: "1" }, "parâmetro desconhecido: ordem"],
    ["injeção num filtro", { regiao: "SUL' OR 1=1 --" }, "regiao"],
  ])("recusa %s", (_nome, entrada, trecho) => {
    const mensagens = mensagensDe(entrada);
    expect(mensagens.length).toBeGreaterThan(0);
    expect(mensagens.join("; ")).toContain(trecho);
  });

  it("aceita exatamente 36 meses", () => {
    expect(filtrosValidos({ inicio: "2023-10-01", fim: "2026-09-30" }).inicio).toBe("2023-10-01");
  });

  it("aceita categoria coerente com o tipo, e categoria sem tipo", () => {
    expect(filtrosValidos({ tipoVeiculo: "LEVE", categoria: "SUV" }).categoria).toBe("SUV");
    expect(filtrosValidos({ categoria: "ONIBUS" }).categoria).toBe("ONIBUS");
  });

  it("as mensagens não repetem o valor recebido", () => {
    expect(mensagensDe({ regiao: "<script>x</script>" }).join("; ")).not.toContain("<script>");
  });
});

describe("filtros: WHERE parametrizado", () => {
  const todos = { inicio: "2026-01-01", fim: "2026-06-30", unidadeId: "1", regiao: "SUL", tipoVeiculo: "LEVE", categoria: "SUV" };

  it("o SQL só tem colunas e placeholders; os valores vão nos parâmetros", () => {
    const { where, params } = montarWhere(filtrosValidos(todos), COLUNAS_VENDA);
    expect(where).toBe(
      "data_venda BETWEEN @inicio AND @fim AND unidade_id = @unidadeId AND unidade_regiao = @regiao " +
        "AND tipo_veiculo = @tipoVeiculo AND categoria = @categoria",
    );
    expect(params).toEqual({ inicio: "2026-01-01", fim: "2026-06-30", unidadeId: 1, regiao: "SUL", tipoVeiculo: "LEVE", categoria: "SUV" });
    for (const valor of ["2026-01-01", "2026-06-30", "SUL", "LEVE", "SUV"]) expect(where).not.toContain(valor);
  });

  it("filtros ausentes não entram no WHERE", () => {
    expect(montarWhere(filtrosValidos({ fim: "2026-09-30" }), COLUNAS_PROPOSTA)).toEqual({
      where: "data_proposta BETWEEN @inicio AND @fim",
      params: { inicio: "2025-10-01", fim: "2026-09-30" },
    });
  });

  it.each([
    ["vw_venda_detalhada", COLUNAS_VENDA, "data_venda"],
    ["vw_proposta_detalhada", COLUNAS_PROPOSTA, "data_proposta"],
  ] as const)("o WHERE executa em %s e filtra como o SQL equivalente", (view, colunas, coluna) => {
    const filtros = filtrosValidos({ inicio: "2026-01-01", fim: "2026-06-30", regiao: "SUDESTE", tipoVeiculo: "LEVE" });
    const { where, params } = montarWhere(filtros, colunas);
    const esperado = contar(
      `SELECT count(*) AS n FROM ${view} WHERE ${coluna} BETWEEN '2026-01-01' AND '2026-06-30' ` +
        "AND unidade_regiao = 'SUDESTE' AND tipo_veiculo = 'LEVE'",
    );
    expect(esperado).toBeGreaterThan(0);
    expect(contar(`SELECT count(*) AS n FROM ${view} WHERE ${where}`, params)).toBe(esperado);
  });

  it("filtro sem coluna correspondente na consulta é erro de programação", () => {
    expect(() => montarWhere(filtrosValidos({ regiao: "SUL" }), { data: "data_venda", unidadeId: "unidade_id" })).toThrow(
      "filtro regiao não suportado",
    );
  });
});

describe("filtros: domínios acompanham o banco", () => {
  const sqlDaTabela = (tabela: string) =>
    (readonlyDb.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabela) as { sql: string }).sql;
  const lista = (texto: string) => [...texto.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);

  it("regiões = CHECK da tabela unidade", () => {
    const check = /regiao IN \(([^)]*)\)/.exec(sqlDaTabela("unidade"))?.[1] ?? "";
    expect(lista(check)).toEqual([...REGIOES]);
  });

  it("tipos e categorias = CHECK da tabela produto", () => {
    const sql = sqlDaTabela("produto");
    expect(lista(/tipo_veiculo IN \(([^)]*)\)/.exec(sql)?.[1] ?? "")).toEqual([...TIPOS_VEICULO]);
    for (const tipo of TIPOS_VEICULO) {
      const check = new RegExp(`tipo_veiculo = '${tipo}' AND categoria IN \\(([^)]*)\\)`).exec(sql)?.[1] ?? "";
      expect(lista(check), tipo).toEqual([...CATEGORIAS_POR_TIPO[tipo]]);
    }
  });
});
