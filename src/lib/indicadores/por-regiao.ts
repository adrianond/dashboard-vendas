import "server-only";
import { readonlyDb } from "../db/readonly-client";
import { CASAS_REAIS, arredondar, percentual } from "./comum";
import { COLUNAS_VENDA, montarWhere, type Filtros, type Regiao } from "./filtros";

// Indicador "por-regiao" (PRD da Etapa 3, seção 6.3): vendas por região da unidade, por data_venda.
// Só aparecem as regiões com venda no recorte.

export type LinhaRegiao = {
  regiao: Regiao;
  receita: number;
  qtdVendas: number;
  ticketMedio: number | null;
  participacaoPct: number | null;
};

type Linha = { regiao: Regiao; receita: number; qtd: number };

export function porRegiao(filtros: Filtros): LinhaRegiao[] {
  const { where, params } = montarWhere(filtros, COLUNAS_VENDA);
  const linhas = readonlyDb
    .prepare(
      `SELECT unidade_regiao AS regiao, SUM(valor_final) AS receita, COUNT(*) AS qtd
       FROM vw_venda_detalhada WHERE ${where}
       GROUP BY unidade_regiao ORDER BY receita DESC`,
    )
    .all(params) as Linha[];
  const total = linhas.reduce((soma, linha) => soma + linha.receita, 0);
  return linhas.map((linha) => ({
    regiao: linha.regiao,
    receita: arredondar(linha.receita, CASAS_REAIS) ?? 0,
    qtdVendas: linha.qtd,
    ticketMedio: arredondar(linha.receita / linha.qtd, CASAS_REAIS),
    participacaoPct: percentual(linha.receita, total),
  }));
}
