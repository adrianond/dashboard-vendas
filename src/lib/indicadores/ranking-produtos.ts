import "server-only";
import { readonlyDb } from "../db/readonly-client";
import { CASAS_REAIS, arredondar } from "./comum";
import { COLUNAS_VENDA, montarWhere, type Categoria, type Filtros, type TipoVeiculo } from "./filtros";

// Indicador "ranking-produtos" (PRD da Etapa 3, seção 6.3): top N por quantidade vendida e top N
// por receita (vendas por data_venda). O mesmo limite corta as duas listas. Desempates
// determinísticos: o outro critério e depois o id do produto.

export type LinhaProduto = {
  posicao: number;
  produtoId: number;
  marca: string;
  modelo: string;
  versao: string;
  tipoVeiculo: TipoVeiculo;
  categoria: Categoria;
  qtdVendas: number;
  receita: number;
};

export type RankingProdutos = { porQuantidade: LinhaProduto[]; porReceita: LinhaProduto[] };

type Linha = {
  produto_id: number;
  marca: string;
  modelo: string;
  versao: string;
  tipo_veiculo: TipoVeiculo;
  categoria: Categoria;
  qtd: number;
  receita: number;
};

const ORDENS = {
  porQuantidade: "qtd DESC, receita DESC, produto_id",
  porReceita: "receita DESC, qtd DESC, produto_id",
} as const;

export function rankingProdutos(filtros: Filtros, limite: number): RankingProdutos {
  const { where, params } = montarWhere(filtros, COLUNAS_VENDA);
  const listar = (ordem: string): LinhaProduto[] =>
    (
      readonlyDb
        .prepare(
          `SELECT produto_id, marca, modelo, versao, tipo_veiculo, categoria, COUNT(*) AS qtd, SUM(valor_final) AS receita
           FROM vw_venda_detalhada WHERE ${where}
           GROUP BY produto_id, marca, modelo, versao, tipo_veiculo, categoria
           ORDER BY ${ordem}
           LIMIT @limite`,
        )
        .all({ ...params, limite }) as Linha[]
    ).map((linha, indice) => ({
      posicao: indice + 1,
      produtoId: linha.produto_id,
      marca: linha.marca,
      modelo: linha.modelo,
      versao: linha.versao,
      tipoVeiculo: linha.tipo_veiculo,
      categoria: linha.categoria,
      qtdVendas: linha.qtd,
      receita: arredondar(linha.receita, CASAS_REAIS) ?? 0,
    }));
  return { porQuantidade: listar(ORDENS.porQuantidade), porReceita: listar(ORDENS.porReceita) };
}
