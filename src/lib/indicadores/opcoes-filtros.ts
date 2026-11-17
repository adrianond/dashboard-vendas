import "server-only";
import { readonlyDb } from "../db/readonly-client";
import { CATEGORIAS_POR_TIPO, REGIOES, TIPOS_VEICULO, type Categoria, type Regiao, type TipoVeiculo } from "./filtros";

// Opções dos seletores do dashboard (rota GET /api/filtros, PRD da Etapa 3, seção 6.3). Sem entrada.

export type OpcoesFiltros = {
  unidades: { id: number; nome: string; regiao: Regiao; ativa: boolean }[];
  regioes: Regiao[];
  tipos: { tipoVeiculo: TipoVeiculo; categorias: Categoria[] }[];
  periodoDisponivel: { inicio: string | null; fim: string | null };
};

export function opcoesFiltros(): OpcoesFiltros {
  const unidades = (
    readonlyDb.prepare("SELECT id, nome, regiao, ativo FROM vw_unidade ORDER BY nome").all() as {
      id: number;
      nome: string;
      regiao: Regiao;
      ativo: number;
    }[]
  ).map(({ ativo, ...unidade }) => ({ ...unidade, ativa: ativo === 1 }));

  // Primeira e última data com dados, entre propostas e vendas.
  const periodo = readonlyDb
    .prepare(
      `SELECT MIN(data) AS inicio, MAX(data) AS fim
       FROM (SELECT data_proposta AS data FROM vw_proposta UNION ALL SELECT data_venda FROM vw_venda)`,
    )
    .get() as { inicio: string | null; fim: string | null };

  return {
    unidades,
    regioes: REGIOES.filter((regiao) => unidades.some((unidade) => unidade.regiao === regiao)),
    tipos: TIPOS_VEICULO.map((tipoVeiculo) => ({ tipoVeiculo, categorias: [...CATEGORIAS_POR_TIPO[tipoVeiculo]] })),
    periodoDisponivel: periodo,
  };
}
