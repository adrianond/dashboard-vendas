// Ponto de entrada da camada de indicadores (PRD da Etapa 3, seção 6). Consultas fixas, sem LLM,
// usadas pelas rotas da API (passo 3.3).
export {
  CATEGORIAS,
  CATEGORIAS_POR_TIPO,
  REGIOES,
  TIPOS_VEICULO,
  LIMITE_MAXIMO,
  LIMITE_PADRAO,
  esquemaFiltros,
  esquemaRanking,
  lerFiltros,
  lerFiltrosRanking,
  type Categoria,
  type Filtros,
  type LeituraFiltros,
  type LeituraRanking,
  type Regiao,
  type TipoVeiculo,
} from "./filtros";
export type { Periodo } from "./comum";
export { resumo, type NumerosResumo, type Resumo } from "./resumo";
export { serieMensal, type MesSerie } from "./serie-mensal";
export { porRegiao, type LinhaRegiao } from "./por-regiao";
export { porUnidade, type LinhaUnidade } from "./por-unidade";
export { porTipoVeiculo, type LinhaCategoria, type LinhaTipo, type PorTipoVeiculo } from "./por-tipo-veiculo";
export { rankingVendedores, type LinhaVendedor } from "./ranking-vendedores";
export { rankingProdutos, type LinhaProduto, type RankingProdutos } from "./ranking-produtos";
export { STATUS_PROPOSTA, funil, type Funil, type StatusProposta } from "./funil";
export { metas, type MesMetas, type Metas, type VendedorMeta } from "./metas";
export { opcoesFiltros, type OpcoesFiltros } from "./opcoes-filtros";
