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
import { arredondar, mesesDoPeriodo, periodoAnterior, variacaoPct } from "@/lib/indicadores/comum";
import {
  funil,
  lerFiltrosRanking,
  metas,
  opcoesFiltros,
  porRegiao,
  porTipoVeiculo,
  porUnidade,
  rankingProdutos,
  rankingVendedores,
  resumo,
  serieMensal,
} from "@/lib/indicadores";

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

describe("utilitários comuns", () => {
  it("arredonda reais com 2 casas e percentuais com 1; sem valor vira null", () => {
    expect(arredondar(1234.5678, 2)).toBe(1234.57);
    expect(arredondar(34.44, 1)).toBe(34.4);
    expect(arredondar(null, 2)).toBeNull();
    expect(arredondar(Number.NaN, 2)).toBeNull();
  });

  it("o período anterior tem o mesmo número de dias e termina na véspera do início", () => {
    expect(periodoAnterior({ inicio: "2025-10-01", fim: "2026-09-30" })).toEqual({ inicio: "2024-10-01", fim: "2025-09-30" });
    expect(periodoAnterior({ inicio: "2026-03-10", fim: "2026-03-20" })).toEqual({ inicio: "2026-02-27", fim: "2026-03-09" });
    expect(periodoAnterior({ inicio: "2026-03-01", fim: "2026-03-01" })).toEqual({ inicio: "2026-02-28", fim: "2026-02-28" });
  });

  it("variação relativa em %, null sem base de comparação", () => {
    expect(variacaoPct(110, 100)).toBe(10);
    expect(variacaoPct(90, 120)).toBe(-25);
    expect(variacaoPct(5, 0)).toBeNull();
    expect(variacaoPct(null, 10)).toBeNull();
    expect(variacaoPct(10, null)).toBeNull();
  });

  it("lista os meses do período, inclusive os das pontas parciais", () => {
    expect(mesesDoPeriodo({ inicio: "2025-11-15", fim: "2026-02-03" })).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

// --- Consistência: SQL independente sobre as TABELAS BASE (PRD 6.4) ---

// Mesmos filtros, escritos de novo sobre as tabelas base (sem as views nem o montarWhere).
function filtroBase(f: Filtros, colunaData: string) {
  const condicoes = [`${colunaData} BETWEEN @inicio AND @fim`];
  const params: Record<string, string | number> = { inicio: f.inicio, fim: f.fim };
  if (f.unidadeId !== undefined) {
    condicoes.push("p.unidade_id = @unidadeId");
    params.unidadeId = f.unidadeId;
  }
  if (f.regiao) {
    condicoes.push("u.regiao = @regiao");
    params.regiao = f.regiao;
  }
  if (f.tipoVeiculo) {
    condicoes.push("pr.tipo_veiculo = @tipoVeiculo");
    params.tipoVeiculo = f.tipoVeiculo;
  }
  if (f.categoria) {
    condicoes.push("pr.categoria = @categoria");
    params.categoria = f.categoria;
  }
  return { where: condicoes.join(" AND "), params };
}

const JOIN_VENDA = "FROM venda v JOIN proposta p ON p.id = v.proposta_id JOIN unidade u ON u.id = p.unidade_id JOIN produto pr ON pr.id = p.produto_id";
const JOIN_PROPOSTA = "FROM proposta p JOIN unidade u ON u.id = p.unidade_id JOIN produto pr ON pr.id = p.produto_id";

type Bruto = { receita: number; qtd: number; ticket: number | null; desconto: number | null; criadas: number; ganhas: number; fechadas: number; negociacao: number };

function brutoBase(f: Filtros): Bruto {
  const fv = filtroBase(f, "v.data_venda");
  const v = readonlyDb
    .prepare(
      `SELECT COALESCE(SUM(v.valor_final), 0) AS receita, COUNT(*) AS qtd, AVG(v.valor_final) AS ticket,
              AVG((p.valor_tabela - p.valor_proposta) * 100.0 / p.valor_tabela) AS desconto ${JOIN_VENDA} WHERE ${fv.where}`,
    )
    .get(fv.params) as Pick<Bruto, "receita" | "qtd" | "ticket" | "desconto">;
  const fp = filtroBase(f, "p.data_proposta");
  const p = readonlyDb
    .prepare(
      `SELECT COUNT(*) AS criadas, COALESCE(SUM(p.status = 'GANHA'), 0) AS ganhas,
              COALESCE(SUM(p.status IN ('GANHA', 'PERDIDA', 'CANCELADA')), 0) AS fechadas,
              COALESCE(SUM(p.status = 'EM_NEGOCIACAO'), 0) AS negociacao ${JOIN_PROPOSTA} WHERE ${fp.where}`,
    )
    .get(fp.params) as Pick<Bruto, "criadas" | "ganhas" | "fechadas" | "negociacao">;
  return { ...v, ...p };
}

// Igual até a unidade de arredondamento (as somas em ordens diferentes podem divergir na última casa).
function quase(recebido: number | null, esperado: number | null, unidade: number) {
  if (esperado === null) return expect(recebido).toBeNull();
  expect(recebido).not.toBeNull();
  expect(Math.abs((recebido as number) - esperado)).toBeLessThanOrEqual(unidade + 1e-9);
}

function conferirNumeros(recebido: ReturnType<typeof resumo>["atual"], b: Bruto) {
  quase(recebido.receitaTotal, b.receita, 0.01);
  expect(recebido.qtdVendas).toBe(b.qtd);
  quase(recebido.ticketMedio, b.ticket, 0.01);
  quase(recebido.descontoMedioPct, b.desconto, 0.1);
  expect(recebido.propostasCriadas).toBe(b.criadas);
  quase(recebido.conversaoPct, b.fechadas ? (b.ganhas * 100) / b.fechadas : null, 0.1);
  expect(recebido.propostasEmNegociacao).toBe(b.negociacao);
}

// A unidade com mais vendas de SUV, para a combinação com todos os filtros retornar dados.
const unidadeSuv = readonlyDb
  .prepare(
    `SELECT u.id, u.regiao ${JOIN_VENDA} WHERE pr.tipo_veiculo = 'LEVE' AND pr.categoria = 'SUV'
     GROUP BY u.id ORDER BY COUNT(*) DESC LIMIT 1`,
  )
  .get() as { id: number; regiao: string };

const COMBINACOES: [nome: string, entrada: Record<string, string>, temDados: boolean][] = [
  ["padrão (12 meses até a data de referência)", {}, true],
  [
    "todos os filtros preenchidos",
    { inicio: "2025-01-01", fim: "2026-06-30", unidadeId: String(unidadeSuv.id), regiao: unidadeSuv.regiao, tipoVeiculo: "LEVE", categoria: "SUV" },
    true,
  ],
  ["período sem dados (antes do início da carga)", { inicio: "2024-01-01", fim: "2024-06-30" }, false],
];

describe.each(COMBINACOES)("consistência com as tabelas base: %s", (_nome, entrada, temDados) => {
  const filtros = filtrosValidos(entrada);

  it("resumo: período atual", () => {
    const b = brutoBase(filtros);
    expect(b.qtd > 0 && b.criadas > 0).toBe(temDados);
    conferirNumeros(resumo(filtros).atual, b);
  });

  it("resumo: período anterior e variação", () => {
    const r = resumo(filtros);
    expect(r.periodoAnterior).toEqual(periodoAnterior(filtros));
    const anterior = brutoBase({ ...filtros, ...r.periodoAnterior });
    conferirNumeros(r.anterior, anterior);
    const atual = brutoBase(filtros);
    quase(r.variacaoPct.receitaTotal, anterior.receita ? ((atual.receita - anterior.receita) * 100) / anterior.receita : null, 0.1);
    quase(r.variacaoPct.qtdVendas, anterior.qtd ? ((atual.qtd - anterior.qtd) * 100) / anterior.qtd : null, 0.1);
  });

  it("serie-mensal: um item por mês, com os valores das tabelas base", () => {
    const serie = serieMensal(filtros);
    expect(serie.map((m) => m.anoMes)).toEqual(mesesDoPeriodo(filtros));
    for (const mes of serie) {
      const recorte = {
        ...filtros,
        inicio: mes.anoMes === filtros.inicio.slice(0, 7) ? filtros.inicio : `${mes.anoMes}-01`,
        fim: mes.anoMes === filtros.fim.slice(0, 7) ? filtros.fim : `${mes.anoMes}-31`,
      };
      const b = brutoBase(recorte);
      quase(mes.receita, b.receita, 0.01);
      expect(mes.qtdVendas, mes.anoMes).toBe(b.qtd);
      expect(mes.propostas, mes.anoMes).toBe(b.criadas);
      quase(mes.conversaoPct, b.fechadas ? (b.ganhas * 100) / b.fechadas : null, 0.1);
    }
    expect(serie.some((m) => m.qtdVendas > 0)).toBe(temDados);
  });
});

// --- Consistência dos recortes (bloco 3b) ---

type Agregado = { chave: string; receita: number; qtd: number };

function vendasAgrupadasBase(f: Filtros, grupo: string): Agregado[] {
  const fv = filtroBase(f, "v.data_venda");
  return readonlyDb
    .prepare(`SELECT ${grupo} AS chave, SUM(v.valor_final) AS receita, COUNT(*) AS qtd ${JOIN_VENDA} WHERE ${fv.where} GROUP BY ${grupo}`)
    .all(fv.params) as Agregado[];
}

function conferirParticipacoes(participacoes: (number | null)[]) {
  if (participacoes.length === 0) return;
  const soma = participacoes.reduce<number>((total, valor) => total + (valor ?? 0), 0);
  expect(Math.abs(soma - 100)).toBeLessThanOrEqual(0.1 * participacoes.length);
}

describe.each(COMBINACOES)("consistência dos recortes com as tabelas base: %s", (_nome, entrada, temDados) => {
  const filtros = filtrosValidos(entrada);

  it("por-regiao", () => {
    const esperado = vendasAgrupadasBase(filtros, "u.regiao");
    const total = esperado.reduce((soma, linha) => soma + linha.receita, 0);
    const recebido = porRegiao(filtros);
    expect(recebido.map((l) => l.regiao).sort()).toEqual(esperado.map((l) => l.chave).sort());
    expect(recebido.length > 0).toBe(temDados);
    for (const linha of recebido) {
      const base = esperado.find((l) => l.chave === linha.regiao)!;
      quase(linha.receita, base.receita, 0.01);
      expect(linha.qtdVendas).toBe(base.qtd);
      quase(linha.ticketMedio, base.receita / base.qtd, 0.01);
      quase(linha.participacaoPct, (base.receita * 100) / total, 0.1);
    }
    expect(recebido.map((l) => l.receita)).toEqual([...recebido.map((l) => l.receita)].sort((a, b) => b - a));
    conferirParticipacoes(recebido.map((l) => l.participacaoPct));
  });

  it("por-tipo-veiculo", () => {
    const porCategoria = vendasAgrupadasBase(filtros, "pr.tipo_veiculo || '/' || pr.categoria");
    const porTipo = vendasAgrupadasBase(filtros, "pr.tipo_veiculo");
    const total = porTipo.reduce((soma, linha) => soma + linha.receita, 0);
    const recebido = porTipoVeiculo(filtros);
    expect(recebido.porTipo.length > 0).toBe(temDados);

    expect(recebido.porTipo.map((l) => l.tipoVeiculo).sort()).toEqual(porTipo.map((l) => l.chave).sort());
    for (const linha of recebido.porTipo) {
      const base = porTipo.find((l) => l.chave === linha.tipoVeiculo)!;
      quase(linha.receita, base.receita, 0.01);
      expect(linha.qtdVendas).toBe(base.qtd);
      quase(linha.ticketMedio, base.receita / base.qtd, 0.01);
      quase(linha.participacaoPct, (base.receita * 100) / total, 0.1);
    }

    expect(recebido.porCategoria.map((l) => `${l.tipoVeiculo}/${l.categoria}`).sort()).toEqual(porCategoria.map((l) => l.chave).sort());
    for (const linha of recebido.porCategoria) {
      const base = porCategoria.find((l) => l.chave === `${linha.tipoVeiculo}/${linha.categoria}`)!;
      quase(linha.receita, base.receita, 0.01);
      expect(linha.qtdVendas).toBe(base.qtd);
      quase(linha.participacaoPct, (base.receita * 100) / total, 0.1);
    }
    conferirParticipacoes(recebido.porTipo.map((l) => l.participacaoPct));
    conferirParticipacoes(recebido.porCategoria.map((l) => l.participacaoPct));
  });

  it("por-unidade", () => {
    const condicoes = ["1 = 1"];
    const params: Record<string, string | number> = {};
    if (filtros.unidadeId !== undefined) {
      condicoes.push("id = @unidadeId");
      params.unidadeId = filtros.unidadeId;
    }
    if (filtros.regiao) {
      condicoes.push("regiao = @regiao");
      params.regiao = filtros.regiao;
    }
    const unidades = readonlyDb.prepare(`SELECT id, nome FROM unidade WHERE ${condicoes.join(" AND ")}`).all(params) as { id: number; nome: string }[];
    const vendas = vendasAgrupadasBase(filtros, "p.unidade_id");
    const fp = filtroBase(filtros, "p.data_proposta");
    const conversao = readonlyDb
      .prepare(
        `SELECT p.unidade_id AS id, SUM(p.status = 'GANHA') AS ganhas, SUM(p.status IN ('GANHA', 'PERDIDA', 'CANCELADA')) AS fechadas
         ${JOIN_PROPOSTA} WHERE ${fp.where} GROUP BY p.unidade_id`,
      )
      .all(fp.params) as { id: number; ganhas: number; fechadas: number }[];
    // Realizado de cada meta recalculado das vendas do vendedor no mês; unidade atual do vendedor.
    const metas = readonlyDb
      .prepare(
        `SELECT ve.unidade_id AS id,
                AVG(r.qtd * 100.0 / m.meta_quantidade) AS qtd_pct, AVG(r.valor * 100.0 / m.meta_valor) AS valor_pct
         FROM meta_vendedor m
         JOIN vendedor ve ON ve.id = m.vendedor_id
         JOIN (SELECT m2.id AS meta_id, COUNT(v.id) AS qtd, COALESCE(SUM(v.valor_final), 0) AS valor
               FROM meta_vendedor m2
               LEFT JOIN proposta p ON p.vendedor_id = m2.vendedor_id
               LEFT JOIN venda v ON v.proposta_id = p.id
                    AND CAST(strftime('%Y', v.data_venda) AS INTEGER) = m2.ano
                    AND CAST(strftime('%m', v.data_venda) AS INTEGER) = m2.mes
               GROUP BY m2.id) r ON r.meta_id = m.id
         WHERE printf('%04d-%02d', m.ano, m.mes) BETWEEN @mesInicio AND @mesFim
         GROUP BY ve.unidade_id`,
      )
      .all({ mesInicio: filtros.inicio.slice(0, 7), mesFim: filtros.fim.slice(0, 7) }) as { id: number; qtd_pct: number; valor_pct: number }[];

    const recebido = porUnidade(filtros);
    expect(recebido.map((l) => l.unidadeId).sort((a, b) => a - b)).toEqual(unidades.map((u) => u.id).sort((a, b) => a - b));
    expect(recebido.some((l) => l.qtdVendas > 0)).toBe(temDados);
    for (const linha of recebido) {
      const venda = vendas.find((l) => Number(l.chave) === linha.unidadeId);
      quase(linha.receita, venda?.receita ?? 0, 0.01);
      expect(linha.qtdVendas).toBe(venda?.qtd ?? 0);
      const c = conversao.find((l) => l.id === linha.unidadeId);
      quase(linha.conversaoPct, c?.fechadas ? (c.ganhas * 100) / c.fechadas : null, 0.1);
      const m = metas.find((l) => l.id === linha.unidadeId);
      quase(linha.atingimentoQtdPct, m?.qtd_pct ?? null, 0.1);
      quase(linha.atingimentoValorPct, m?.valor_pct ?? null, 0.1);
    }
  });
});

// --- Rankings (bloco 3c) ---

describe("rankings: parâmetro limite", () => {
  it("padrão 10; aceita de 1 a 50", () => {
    expect(lerFiltrosRanking({})).toMatchObject({ ok: true, limite: 10 });
    expect(lerFiltrosRanking({ limite: "" })).toMatchObject({ ok: true, limite: 10 });
    expect(lerFiltrosRanking({ limite: "1" })).toMatchObject({ ok: true, limite: 1 });
    expect(lerFiltrosRanking({ limite: "50", regiao: "SUL" })).toMatchObject({ ok: true, limite: 50, filtros: { regiao: "SUL" } });
  });

  it.each(["0", "51", "100", "-1", "2.5", "10; DROP TABLE venda", "dez"])("recusa limite = %j", (limite) => {
    const leitura = lerFiltrosRanking({ limite });
    expect(leitura.ok).toBe(false);
    if (!leitura.ok) expect(leitura.mensagens.join("; ")).toContain("limite");
  });

  it("os rankings aplicam as mesmas regras dos filtros comuns", () => {
    expect(lerFiltrosRanking({ categoria: "SUV", tipoVeiculo: "MOTO" }).ok).toBe(false);
    expect(lerFiltrosRanking({ ordem: "1" }).ok).toBe(false);
  });

  it("nos demais indicadores, limite é parâmetro desconhecido", () => {
    expect(mensagensDe({ limite: "10" })).toEqual(["parâmetro desconhecido: limite"]);
  });
});

describe.each(COMBINACOES)("consistência dos rankings com as tabelas base: %s", (_nome, entrada, temDados) => {
  const filtros = filtrosValidos(entrada);

  it.each([10, 3])("ranking-vendedores (limite %i)", (limite) => {
    const fv = filtroBase(filtros, "v.data_venda");
    const esperado = readonlyDb
      .prepare(
        `SELECT p.vendedor_id AS id, SUM(v.valor_final) AS receita, COUNT(*) AS qtd,
                AVG((p.valor_tabela - p.valor_proposta) * 100.0 / p.valor_tabela) AS desconto
         ${JOIN_VENDA} WHERE ${fv.where}
         GROUP BY p.vendedor_id ORDER BY receita DESC, qtd DESC, p.vendedor_id LIMIT ${limite}`,
      )
      .all(fv.params) as { id: number; receita: number; qtd: number; desconto: number }[];
    const fp = filtroBase(filtros, "p.data_proposta");
    const conversao = readonlyDb
      .prepare(
        `SELECT p.vendedor_id AS id, SUM(p.status = 'GANHA') AS ganhas, SUM(p.status IN ('GANHA', 'PERDIDA', 'CANCELADA')) AS fechadas
         ${JOIN_PROPOSTA} WHERE ${fp.where} GROUP BY p.vendedor_id`,
      )
      .all(fp.params) as { id: number; ganhas: number; fechadas: number }[];
    const unidadeAtual = readonlyDb
      .prepare("SELECT ve.id, u.id AS unidade_id, u.nome AS unidade FROM vendedor ve JOIN unidade u ON u.id = ve.unidade_id")
      .all() as { id: number; unidade_id: number; unidade: string }[];

    const recebido = rankingVendedores(filtros, limite);
    expect(recebido.length).toBeLessThanOrEqual(limite);
    expect(recebido.length > 0).toBe(temDados);
    expect(recebido.map((l) => l.vendedorId)).toEqual(esperado.map((l) => l.id));
    recebido.forEach((linha, indice) => {
      const base = esperado[indice];
      expect(linha.posicao).toBe(indice + 1);
      quase(linha.receita, base.receita, 0.01);
      expect(linha.qtdVendas).toBe(base.qtd);
      quase(linha.ticketMedio, base.receita / base.qtd, 0.01);
      quase(linha.descontoMedioPct, base.desconto, 0.1);
      const c = conversao.find((l) => l.id === linha.vendedorId);
      quase(linha.conversaoPct, c?.fechadas ? (c.ganhas * 100) / c.fechadas : null, 0.1);
      expect(linha.unidadeId).toBe(unidadeAtual.find((u) => u.id === linha.vendedorId)?.unidade_id);
    });
  });

  it.each([10, 3])("ranking-produtos (limite %i)", (limite) => {
    const fv = filtroBase(filtros, "v.data_venda");
    const listar = (ordem: string) =>
      readonlyDb
        .prepare(
          `SELECT pr.id, pr.marca, pr.modelo, COUNT(*) AS qtd, SUM(v.valor_final) AS receita
           ${JOIN_VENDA} WHERE ${fv.where} GROUP BY pr.id ORDER BY ${ordem} LIMIT ${limite}`,
        )
        .all(fv.params) as { id: number; marca: string; modelo: string; qtd: number; receita: number }[];
    const recebido = rankingProdutos(filtros, limite);

    for (const [lista, ordem] of [
      [recebido.porQuantidade, "qtd DESC, receita DESC, pr.id"],
      [recebido.porReceita, "receita DESC, qtd DESC, pr.id"],
    ] as const) {
      const esperado = listar(ordem);
      expect(lista.length).toBeLessThanOrEqual(limite);
      expect(lista.length > 0).toBe(temDados);
      expect(lista.map((l) => l.produtoId)).toEqual(esperado.map((l) => l.id));
      lista.forEach((linha, indice) => {
        expect(linha.posicao).toBe(indice + 1);
        expect(linha.qtdVendas).toBe(esperado[indice].qtd);
        quase(linha.receita, esperado[indice].receita, 0.01);
        expect([linha.marca, linha.modelo]).toEqual([esperado[indice].marca, esperado[indice].modelo]);
      });
    }
  });
});

// --- Funil, metas e opções dos filtros (bloco 3d) ---

// Cada meta com o realizado recalculado das vendas do vendedor no mês; unidade atual do vendedor.
const METAS_BASE = `
  SELECT m.vendedor_id, printf('%04d-%02d', m.ano, m.mes) AS ano_mes, m.meta_quantidade, m.meta_valor,
         ve.unidade_id, u.regiao, r.qtd, r.valor
  FROM meta_vendedor m
  JOIN vendedor ve ON ve.id = m.vendedor_id
  JOIN unidade u ON u.id = ve.unidade_id
  JOIN (SELECT m2.id AS meta_id, COUNT(v.id) AS qtd, COALESCE(SUM(v.valor_final), 0) AS valor
        FROM meta_vendedor m2
        LEFT JOIN proposta p ON p.vendedor_id = m2.vendedor_id
        LEFT JOIN venda v ON v.proposta_id = p.id
             AND CAST(strftime('%Y', v.data_venda) AS INTEGER) = m2.ano
             AND CAST(strftime('%m', v.data_venda) AS INTEGER) = m2.mes
        GROUP BY m2.id) r ON r.meta_id = m.id`;

type MetaBase = { vendedor_id: number; ano_mes: string; meta_quantidade: number; meta_valor: number; unidade_id: number; regiao: string; qtd: number; valor: number };

function metasBase(f: Filtros): MetaBase[] {
  const mesInicio = f.inicio.slice(0, 7);
  const mesFim = f.fim.slice(0, 7);
  return (readonlyDb.prepare(METAS_BASE).all() as MetaBase[]).filter(
    (m) =>
      m.ano_mes >= mesInicio &&
      m.ano_mes <= mesFim &&
      (f.unidadeId === undefined || m.unidade_id === f.unidadeId) &&
      (!f.regiao || m.regiao === f.regiao),
  );
}

const media = (valores: number[]) => (valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null);

describe.each(COMBINACOES)("consistência de funil e metas com as tabelas base: %s", (_nome, entrada, temDados) => {
  const filtros = filtrosValidos(entrada);

  it("funil", () => {
    const fp = filtroBase(filtros, "p.data_proposta");
    const porStatus = readonlyDb
      .prepare(`SELECT p.status, COUNT(*) AS n ${JOIN_PROPOSTA} WHERE ${fp.where} GROUP BY p.status`)
      .all(fp.params) as { status: string; n: number }[];
    const n = (status: string) => porStatus.find((l) => l.status === status)?.n ?? 0;
    const total = porStatus.reduce((soma, l) => soma + l.n, 0);
    const motivos = readonlyDb
      .prepare(`SELECT p.motivo_perda AS motivo, COUNT(*) AS n ${JOIN_PROPOSTA} WHERE ${fp.where} AND p.status = 'PERDIDA' GROUP BY p.motivo_perda`)
      .all(fp.params) as { motivo: string; n: number }[];
    const { dias } = readonlyDb
      .prepare(
        `SELECT AVG(CAST(julianday(p.data_fechamento) - julianday(p.data_proposta) AS INTEGER)) AS dias
         ${JOIN_PROPOSTA} WHERE ${fp.where} AND p.status IN ('GANHA', 'PERDIDA', 'CANCELADA')`,
      )
      .get(fp.params) as { dias: number | null };

    const recebido = funil(filtros);
    expect(recebido.total > 0).toBe(temDados);
    expect(recebido.total).toBe(total);
    expect(recebido.porStatus.map((l) => l.status)).toEqual(["EM_NEGOCIACAO", "GANHA", "PERDIDA", "CANCELADA"]);
    for (const linha of recebido.porStatus) {
      expect(linha.quantidade, linha.status).toBe(n(linha.status));
      quase(linha.pct, total ? (n(linha.status) * 100) / total : null, 0.1);
    }
    const fechadas = n("GANHA") + n("PERDIDA") + n("CANCELADA");
    quase(recebido.conversaoPct, fechadas ? (n("GANHA") * 100) / fechadas : null, 0.1);
    expect(recebido.motivosPerda.map((l) => l.motivo).sort()).toEqual(motivos.map((l) => l.motivo).sort());
    for (const linha of recebido.motivosPerda) {
      const base = motivos.find((l) => l.motivo === linha.motivo)!;
      expect(linha.quantidade).toBe(base.n);
      quase(linha.pct, (base.n * 100) / n("PERDIDA"), 0.1);
    }
    expect(recebido.motivosPerda.map((l) => l.quantidade)).toEqual([...recebido.motivosPerda.map((l) => l.quantidade)].sort((a, b) => b - a));
    quase(recebido.tempoMedioFechamentoDias, dias, 0.1);
  });

  it("metas", () => {
    const base = metasBase(filtros);
    const meses = [...new Set(base.map((m) => m.ano_mes))].sort();
    const recebido = metas(filtros);
    expect(recebido.porMes.length > 0).toBe(temDados);
    expect(recebido.porMes.map((m) => m.anoMes)).toEqual(meses);

    for (const mes of recebido.porMes) {
      const doMes = base.filter((m) => m.ano_mes === mes.anoMes);
      expect(mes.vendedoresComMeta).toBe(doMes.length);
      expect(mes.bateramQuantidade).toBe(doMes.filter((m) => m.qtd >= m.meta_quantidade).length);
      expect(mes.bateramValor).toBe(doMes.filter((m) => m.valor >= m.meta_valor).length);
      quase(mes.atingimentoQtdPct, media(doMes.map((m) => (m.qtd * 100) / m.meta_quantidade)), 0.1);
      quase(mes.atingimentoValorPct, media(doMes.map((m) => (m.valor * 100) / m.meta_valor)), 0.1);
    }

    if (!temDados) return expect(recebido.mesMaisRecente).toBeNull();
    const ultimo = meses.at(-1)!;
    const doUltimo = base.filter((m) => m.ano_mes === ultimo);
    expect(recebido.mesMaisRecente?.anoMes).toBe(ultimo);
    const vendedores = recebido.mesMaisRecente!.vendedores;
    expect(vendedores.map((v) => v.vendedorId).sort((a, b) => a - b)).toEqual(doUltimo.map((m) => m.vendedor_id).sort((a, b) => a - b));
    for (const v of vendedores) {
      const m = doUltimo.find((linha) => linha.vendedor_id === v.vendedorId)!;
      expect([v.metaQuantidade, v.qtdVendida, v.bateuQuantidade]).toEqual([m.meta_quantidade, m.qtd, m.qtd >= m.meta_quantidade]);
      quase(v.metaValor, m.meta_valor, 0.01);
      quase(v.valorVendido, m.valor, 0.01);
      expect(v.bateuValor).toBe(m.valor >= m.meta_valor);
      quase(v.atingimentoValorPct, (m.valor * 100) / m.meta_valor, 0.1);
    }
    const atingimentos = vendedores.map((v) => v.atingimentoValorPct ?? 0);
    expect(atingimentos).toEqual([...atingimentos].sort((a, b) => b - a));
  });
});

describe("opções dos filtros", () => {
  const opcoes = opcoesFiltros();

  it("unidades e regiões vêm das tabelas base", () => {
    const unidades = readonlyDb.prepare("SELECT id, nome, regiao, ativo FROM unidade ORDER BY nome").all() as { id: number; nome: string; regiao: string; ativo: number }[];
    expect(opcoes.unidades).toEqual(unidades.map(({ ativo, ...u }) => ({ ...u, ativa: ativo === 1 })));
    const regioes = new Set(unidades.map((u) => u.regiao));
    expect(opcoes.regioes).toEqual(REGIOES.filter((r) => regioes.has(r)));
  });

  it("tipos e categorias são os domínios do banco", () => {
    expect(opcoes.tipos).toEqual(TIPOS_VEICULO.map((tipoVeiculo) => ({ tipoVeiculo, categorias: [...CATEGORIAS_POR_TIPO[tipoVeiculo]] })));
  });

  it("período disponível = primeira e última data entre propostas e vendas", () => {
    const esperado = readonlyDb
      .prepare("SELECT MIN(d) AS inicio, MAX(d) AS fim FROM (SELECT data_proposta AS d FROM proposta UNION ALL SELECT data_venda FROM venda)")
      .get();
    expect(opcoes.periodoDisponivel).toEqual(esperado);
    expect(opcoes.periodoDisponivel.fim).toBe(env.DATA_REFERENCIA);
  });
});
