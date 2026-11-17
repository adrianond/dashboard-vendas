import "server-only";
import { readonlyDb } from "../db/readonly-client";
import { CASAS_PCT, CASAS_REAIS, arredondar, percentual } from "./comum";
import { COLUNAS_PROPOSTA, COLUNAS_VENDA, montarWhere, type Filtros, type Regiao } from "./filtros";

// Indicador "por-unidade" (PRD da Etapa 3, seção 6.3). Lista toda unidade que atende aos filtros de
// unidade e região, inclusive as sem vendas no período. Receita por data_venda e conversão por
// data_proposta, pela unidade da venda/proposta. O atingimento de meta vem da
// vw_desempenho_vendedor_mes, nos meses do período: usa a unidade ATUAL do vendedor e não depende
// de tipo/categoria (as metas não são por produto).

export type LinhaUnidade = {
  unidadeId: number;
  unidade: string;
  regiao: Regiao;
  receita: number;
  qtdVendas: number;
  conversaoPct: number | null;
  atingimentoQtdPct: number | null;
  atingimentoValorPct: number | null;
};

type Unidade = { id: number; nome: string; regiao: Regiao };
type Vendas = { unidade_id: number; receita: number; qtd: number };
type Propostas = { unidade_id: number; ganhas: number; fechadas: number };
type Metas = { unidade_id: number; qtd_pct: number; valor_pct: number };

function porUnidadeId<T extends { unidade_id: number }>(linhas: T[]): Map<number, T> {
  return new Map(linhas.map((linha) => [linha.unidade_id, linha]));
}

export function porUnidade(filtros: Filtros): LinhaUnidade[] {
  const condicoesUnidade = ["1 = 1"];
  const paramsUnidade: Record<string, string | number> = {};
  if (filtros.unidadeId !== undefined) {
    condicoesUnidade.push("id = @unidadeId");
    paramsUnidade.unidadeId = filtros.unidadeId;
  }
  if (filtros.regiao) {
    condicoesUnidade.push("regiao = @regiao");
    paramsUnidade.regiao = filtros.regiao;
  }
  const unidades = readonlyDb
    .prepare(`SELECT id, nome, regiao FROM vw_unidade WHERE ${condicoesUnidade.join(" AND ")}`)
    .all(paramsUnidade) as Unidade[];

  const v = montarWhere(filtros, COLUNAS_VENDA);
  const vendas = porUnidadeId(
    readonlyDb
      .prepare(
        `SELECT unidade_id, SUM(valor_final) AS receita, COUNT(*) AS qtd
         FROM vw_venda_detalhada WHERE ${v.where} GROUP BY unidade_id`,
      )
      .all(v.params) as Vendas[],
  );

  const p = montarWhere(filtros, COLUNAS_PROPOSTA);
  const propostas = porUnidadeId(
    readonlyDb
      .prepare(
        `SELECT unidade_id, SUM(status = 'GANHA') AS ganhas, SUM(status <> 'EM_NEGOCIACAO') AS fechadas
         FROM vw_proposta_detalhada WHERE ${p.where} GROUP BY unidade_id`,
      )
      .all(p.params) as Propostas[],
  );

  const metas = porUnidadeId(
    readonlyDb
      .prepare(
        `SELECT unidade_id, AVG(atingimento_quantidade_pct) AS qtd_pct, AVG(atingimento_valor_pct) AS valor_pct
         FROM vw_desempenho_vendedor_mes WHERE ano_mes BETWEEN @mesInicio AND @mesFim GROUP BY unidade_id`,
      )
      .all({ mesInicio: filtros.inicio.slice(0, 7), mesFim: filtros.fim.slice(0, 7) }) as Metas[],
  );

  return unidades
    .map((unidade) => {
      const venda = vendas.get(unidade.id);
      const proposta = propostas.get(unidade.id);
      const meta = metas.get(unidade.id);
      return {
        unidadeId: unidade.id,
        unidade: unidade.nome,
        regiao: unidade.regiao,
        receita: arredondar(venda?.receita ?? 0, CASAS_REAIS) ?? 0,
        qtdVendas: venda?.qtd ?? 0,
        conversaoPct: percentual(proposta?.ganhas ?? 0, proposta?.fechadas ?? 0),
        atingimentoQtdPct: arredondar(meta?.qtd_pct, CASAS_PCT),
        atingimentoValorPct: arredondar(meta?.valor_pct, CASAS_PCT),
      };
    })
    .sort((a, b) => b.receita - a.receita || a.unidadeId - b.unidadeId);
}
