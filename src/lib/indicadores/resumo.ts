import "server-only";
import { readonlyDb } from "../db/readonly-client";
import { CASAS_PCT, CASAS_REAIS, arredondar, percentual, periodoAnterior, variacaoPct, type Periodo } from "./comum";
import { COLUNAS_PROPOSTA, COLUNAS_VENDA, montarWhere, type Filtros } from "./filtros";

// Indicador "resumo" (PRD da Etapa 3, seção 6.3): os números do período, os do período anterior de
// mesmo tamanho e a variação de cada um. Definições iguais às do docs/schema.md: vendas por
// data_venda; propostas, conversão e negociação por data_proposta.

export type NumerosResumo = {
  receitaTotal: number;
  qtdVendas: number;
  ticketMedio: number | null;
  descontoMedioPct: number | null;
  propostasCriadas: number;
  conversaoPct: number | null;
  propostasEmNegociacao: number;
};

export type Resumo = {
  periodo: Periodo;
  periodoAnterior: Periodo;
  atual: NumerosResumo;
  anterior: NumerosResumo;
  variacaoPct: Record<keyof NumerosResumo, number | null>;
};

type LinhaVendas = { receita: number | null; qtd: number; ticket: number | null; desconto: number | null };
type LinhaPropostas = { criadas: number; ganhas: number | null; fechadas: number | null; em_negociacao: number | null };

function numeros(filtros: Filtros): NumerosResumo {
  const vendas = montarWhere(filtros, COLUNAS_VENDA);
  const v = readonlyDb
    .prepare(
      `SELECT SUM(valor_final) AS receita, COUNT(*) AS qtd, AVG(valor_final) AS ticket, AVG(desconto_percentual) AS desconto
       FROM vw_venda_detalhada WHERE ${vendas.where}`,
    )
    .get(vendas.params) as LinhaVendas;

  const propostas = montarWhere(filtros, COLUNAS_PROPOSTA);
  const p = readonlyDb
    .prepare(
      `SELECT COUNT(*) AS criadas, SUM(status = 'GANHA') AS ganhas, SUM(status <> 'EM_NEGOCIACAO') AS fechadas,
              SUM(status = 'EM_NEGOCIACAO') AS em_negociacao
       FROM vw_proposta_detalhada WHERE ${propostas.where}`,
    )
    .get(propostas.params) as LinhaPropostas;

  return {
    receitaTotal: arredondar(v.receita ?? 0, CASAS_REAIS) ?? 0,
    qtdVendas: v.qtd,
    ticketMedio: arredondar(v.ticket, CASAS_REAIS),
    descontoMedioPct: arredondar(v.desconto, CASAS_PCT),
    propostasCriadas: p.criadas,
    conversaoPct: percentual(p.ganhas ?? 0, p.fechadas ?? 0),
    propostasEmNegociacao: p.em_negociacao ?? 0,
  };
}

export function resumo(filtros: Filtros): Resumo {
  const anteriorPeriodo = periodoAnterior(filtros);
  const atual = numeros(filtros);
  const anterior = numeros({ ...filtros, ...anteriorPeriodo });
  const chaves = Object.keys(atual) as (keyof NumerosResumo)[];
  return {
    periodo: { inicio: filtros.inicio, fim: filtros.fim },
    periodoAnterior: anteriorPeriodo,
    atual,
    anterior,
    variacaoPct: Object.fromEntries(chaves.map((chave) => [chave, variacaoPct(atual[chave], anterior[chave])])) as Resumo["variacaoPct"],
  };
}
