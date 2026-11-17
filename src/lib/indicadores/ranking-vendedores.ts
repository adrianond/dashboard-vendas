import "server-only";
import { readonlyDb } from "../db/readonly-client";
import { CASAS_PCT, CASAS_REAIS, arredondar, percentual } from "./comum";
import { COLUNAS_PROPOSTA, COLUNAS_VENDA, montarWhere, type Filtros } from "./filtros";

// Indicador "ranking-vendedores" (PRD da Etapa 3, seção 6.3): top N por receita (vendas por
// data_venda). Os filtros de unidade e região valem para a unidade da venda; a unidade exibida é a
// atual do vendedor. Desconto médio das vendas; conversão das propostas do vendedor (data_proposta).

export type LinhaVendedor = {
  posicao: number;
  vendedorId: number;
  vendedor: string;
  unidadeId: number;
  unidade: string;
  receita: number;
  qtdVendas: number;
  ticketMedio: number | null;
  descontoMedioPct: number | null;
  conversaoPct: number | null;
};

type Vendas = { vendedor_id: number; vendedor_nome: string; receita: number; qtd: number; desconto: number };
type Propostas = { vendedor_id: number; ganhas: number; fechadas: number };
type UnidadeAtual = { vendedor_id: number; unidade_id: number; unidade_nome: string };

export function rankingVendedores(filtros: Filtros, limite: number): LinhaVendedor[] {
  const v = montarWhere(filtros, COLUNAS_VENDA);
  const vendas = readonlyDb
    .prepare(
      `SELECT vendedor_id, vendedor_nome, SUM(valor_final) AS receita, COUNT(*) AS qtd, AVG(desconto_percentual) AS desconto
       FROM vw_venda_detalhada WHERE ${v.where}
       GROUP BY vendedor_id, vendedor_nome
       ORDER BY receita DESC, qtd DESC, vendedor_id
       LIMIT @limite`,
    )
    .all({ ...v.params, limite }) as Vendas[];

  const p = montarWhere(filtros, COLUNAS_PROPOSTA);
  const propostas = new Map(
    (
      readonlyDb
        .prepare(
          `SELECT vendedor_id, SUM(status = 'GANHA') AS ganhas, SUM(status <> 'EM_NEGOCIACAO') AS fechadas
           FROM vw_proposta_detalhada WHERE ${p.where} GROUP BY vendedor_id`,
        )
        .all(p.params) as Propostas[]
    ).map((linha) => [linha.vendedor_id, linha]),
  );

  const unidades = new Map(
    (
      readonlyDb
        .prepare(
          `SELECT ve.id AS vendedor_id, u.id AS unidade_id, u.nome AS unidade_nome
           FROM vw_vendedor ve JOIN vw_unidade u ON u.id = ve.unidade_id`,
        )
        .all() as UnidadeAtual[]
    ).map((linha) => [linha.vendedor_id, linha]),
  );

  return vendas.map((linha, indice) => {
    const proposta = propostas.get(linha.vendedor_id);
    const unidade = unidades.get(linha.vendedor_id);
    return {
      posicao: indice + 1,
      vendedorId: linha.vendedor_id,
      vendedor: linha.vendedor_nome,
      unidadeId: unidade?.unidade_id ?? 0,
      unidade: unidade?.unidade_nome ?? "",
      receita: arredondar(linha.receita, CASAS_REAIS) ?? 0,
      qtdVendas: linha.qtd,
      ticketMedio: arredondar(linha.receita / linha.qtd, CASAS_REAIS),
      descontoMedioPct: arredondar(linha.desconto, CASAS_PCT),
      conversaoPct: percentual(proposta?.ganhas ?? 0, proposta?.fechadas ?? 0),
    };
  });
}
