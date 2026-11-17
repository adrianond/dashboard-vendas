import "server-only";
import { readonlyDb } from "../db/readonly-client";
import { CASAS_REAIS, arredondar, mesesDoPeriodo, percentual } from "./comum";
import { COLUNAS_PROPOSTA, COLUNAS_VENDA, montarWhere, type Filtros } from "./filtros";

// Indicador "serie-mensal" (PRD da Etapa 3, seção 6.3): um item por mês do período, inclusive os
// meses sem dados (com zero), para o gráfico não ter buracos. Vendas por data_venda; propostas e
// conversão por data_proposta.

export type MesSerie = {
  anoMes: string;
  receita: number;
  qtdVendas: number;
  propostas: number;
  conversaoPct: number | null;
};

type LinhaVendas = { ano_mes: string; receita: number; qtd: number };
type LinhaPropostas = { ano_mes: string; propostas: number; ganhas: number; fechadas: number };

export function serieMensal(filtros: Filtros): MesSerie[] {
  const vendas = montarWhere(filtros, COLUNAS_VENDA);
  const porMesVendas = new Map(
    (
      readonlyDb
        .prepare(
          `SELECT ano_mes_venda AS ano_mes, SUM(valor_final) AS receita, COUNT(*) AS qtd
           FROM vw_venda_detalhada WHERE ${vendas.where} GROUP BY ano_mes_venda`,
        )
        .all(vendas.params) as LinhaVendas[]
    ).map((linha) => [linha.ano_mes, linha]),
  );

  const propostas = montarWhere(filtros, COLUNAS_PROPOSTA);
  const porMesPropostas = new Map(
    (
      readonlyDb
        .prepare(
          `SELECT ano_mes_proposta AS ano_mes, COUNT(*) AS propostas, SUM(status = 'GANHA') AS ganhas,
                  SUM(status <> 'EM_NEGOCIACAO') AS fechadas
           FROM vw_proposta_detalhada WHERE ${propostas.where} GROUP BY ano_mes_proposta`,
        )
        .all(propostas.params) as LinhaPropostas[]
    ).map((linha) => [linha.ano_mes, linha]),
  );

  return mesesDoPeriodo(filtros).map((anoMes) => {
    const v = porMesVendas.get(anoMes);
    const p = porMesPropostas.get(anoMes);
    return {
      anoMes,
      receita: arredondar(v?.receita ?? 0, CASAS_REAIS) ?? 0,
      qtdVendas: v?.qtd ?? 0,
      propostas: p?.propostas ?? 0,
      conversaoPct: percentual(p?.ganhas ?? 0, p?.fechadas ?? 0),
    };
  });
}
