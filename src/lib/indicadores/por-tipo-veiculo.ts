import "server-only";
import { readonlyDb } from "../db/readonly-client";
import { CASAS_REAIS, arredondar, percentual } from "./comum";
import { COLUNAS_VENDA, montarWhere, type Categoria, type Filtros, type TipoVeiculo } from "./filtros";

// Indicador "por-tipo-veiculo" (PRD da Etapa 3, seção 6.3): vendas por tipo e por categoria de
// veículo, por data_venda. Participação sobre a receita total do recorte. Só aparece o que teve venda.

type Numeros = { receita: number; qtdVendas: number; ticketMedio: number | null; participacaoPct: number | null };
export type LinhaTipo = { tipoVeiculo: TipoVeiculo } & Numeros;
export type LinhaCategoria = { tipoVeiculo: TipoVeiculo; categoria: Categoria } & Numeros;
export type PorTipoVeiculo = { porTipo: LinhaTipo[]; porCategoria: LinhaCategoria[] };

type Linha = { tipo: TipoVeiculo; categoria: Categoria; receita: number; qtd: number };

function numeros(receita: number, qtd: number, total: number): Numeros {
  return {
    receita: arredondar(receita, CASAS_REAIS) ?? 0,
    qtdVendas: qtd,
    ticketMedio: arredondar(receita / qtd, CASAS_REAIS),
    participacaoPct: percentual(receita, total),
  };
}

export function porTipoVeiculo(filtros: Filtros): PorTipoVeiculo {
  const { where, params } = montarWhere(filtros, COLUNAS_VENDA);
  const linhas = readonlyDb
    .prepare(
      `SELECT tipo_veiculo AS tipo, categoria, SUM(valor_final) AS receita, COUNT(*) AS qtd
       FROM vw_venda_detalhada WHERE ${where}
       GROUP BY tipo_veiculo, categoria ORDER BY receita DESC`,
    )
    .all(params) as Linha[];
  const total = linhas.reduce((soma, linha) => soma + linha.receita, 0);

  const tipos = new Map<TipoVeiculo, { receita: number; qtd: number }>();
  for (const linha of linhas) {
    const acumulado = tipos.get(linha.tipo) ?? { receita: 0, qtd: 0 };
    tipos.set(linha.tipo, { receita: acumulado.receita + linha.receita, qtd: acumulado.qtd + linha.qtd });
  }

  return {
    porTipo: [...tipos]
      .sort(([, a], [, b]) => b.receita - a.receita)
      .map(([tipoVeiculo, { receita, qtd }]) => ({ tipoVeiculo, ...numeros(receita, qtd, total) })),
    porCategoria: linhas.map((linha) => ({
      tipoVeiculo: linha.tipo,
      categoria: linha.categoria,
      ...numeros(linha.receita, linha.qtd, total),
    })),
  };
}
