import "server-only";
import { readonlyDb } from "../db/readonly-client";
import { CASAS_PCT, CASAS_REAIS, arredondar } from "./comum";
import type { Filtros } from "./filtros";

// Indicador "metas" (PRD da Etapa 3, seção 6.3), da vw_desempenho_vendedor_mes nos meses do período.
// Unidade e região filtram pela unidade ATUAL do vendedor (como a view); tipo e categoria não se
// aplicam, porque as metas não são por produto. O "mês mais recente" é o último mês do período com metas.

export type MesMetas = {
  anoMes: string;
  vendedoresComMeta: number;
  bateramQuantidade: number;
  bateramValor: number;
  atingimentoQtdPct: number | null;
  atingimentoValorPct: number | null;
};

export type VendedorMeta = {
  vendedorId: number;
  vendedor: string;
  unidadeId: number;
  unidade: string;
  metaQuantidade: number;
  qtdVendida: number;
  atingimentoQtdPct: number | null;
  bateuQuantidade: boolean;
  metaValor: number;
  valorVendido: number;
  atingimentoValorPct: number | null;
  bateuValor: boolean;
};

export type Metas = { porMes: MesMetas[]; mesMaisRecente: { anoMes: string; vendedores: VendedorMeta[] } | null };

type LinhaMes = { ano_mes: string; vendedores: number; bateram_qtd: number; bateram_valor: number; qtd_pct: number; valor_pct: number };
type LinhaVendedor = {
  vendedor_id: number;
  vendedor_nome: string;
  unidade_id: number;
  unidade_nome: string;
  meta_quantidade: number;
  qtd_vendida: number;
  atingimento_quantidade_pct: number;
  bateu_meta_quantidade: number;
  meta_valor: number;
  valor_vendido: number;
  atingimento_valor_pct: number;
  bateu_meta_valor: number;
};

function filtroMetas(filtros: Filtros) {
  const condicoes = ["d.ano_mes BETWEEN @mesInicio AND @mesFim"];
  const params: Record<string, string | number> = { mesInicio: filtros.inicio.slice(0, 7), mesFim: filtros.fim.slice(0, 7) };
  if (filtros.unidadeId !== undefined) {
    condicoes.push("d.unidade_id = @unidadeId");
    params.unidadeId = filtros.unidadeId;
  }
  if (filtros.regiao) {
    condicoes.push("u.regiao = @regiao");
    params.regiao = filtros.regiao;
  }
  return { where: condicoes.join(" AND "), params };
}

const ORIGEM = "FROM vw_desempenho_vendedor_mes d JOIN vw_unidade u ON u.id = d.unidade_id";

export function metas(filtros: Filtros): Metas {
  const { where, params } = filtroMetas(filtros);

  const porMes = (
    readonlyDb
      .prepare(
        `SELECT d.ano_mes, COUNT(*) AS vendedores, SUM(d.bateu_meta_quantidade) AS bateram_qtd,
                SUM(d.bateu_meta_valor) AS bateram_valor, AVG(d.atingimento_quantidade_pct) AS qtd_pct,
                AVG(d.atingimento_valor_pct) AS valor_pct
         ${ORIGEM} WHERE ${where} GROUP BY d.ano_mes ORDER BY d.ano_mes`,
      )
      .all(params) as LinhaMes[]
  ).map((linha) => ({
    anoMes: linha.ano_mes,
    vendedoresComMeta: linha.vendedores,
    bateramQuantidade: linha.bateram_qtd,
    bateramValor: linha.bateram_valor,
    atingimentoQtdPct: arredondar(linha.qtd_pct, CASAS_PCT),
    atingimentoValorPct: arredondar(linha.valor_pct, CASAS_PCT),
  }));

  const anoMes = porMes.at(-1)?.anoMes;
  if (!anoMes) return { porMes, mesMaisRecente: null };

  const vendedores = (
    readonlyDb
      .prepare(
        `SELECT d.vendedor_id, d.vendedor_nome, d.unidade_id, d.unidade_nome, d.meta_quantidade, d.qtd_vendida,
                d.atingimento_quantidade_pct, d.bateu_meta_quantidade, d.meta_valor, d.valor_vendido,
                d.atingimento_valor_pct, d.bateu_meta_valor
         ${ORIGEM} WHERE ${where} AND d.ano_mes = @anoMes
         ORDER BY d.atingimento_valor_pct DESC, d.vendedor_id`,
      )
      .all({ ...params, anoMes }) as LinhaVendedor[]
  ).map((linha) => ({
    vendedorId: linha.vendedor_id,
    vendedor: linha.vendedor_nome,
    unidadeId: linha.unidade_id,
    unidade: linha.unidade_nome,
    metaQuantidade: linha.meta_quantidade,
    qtdVendida: linha.qtd_vendida,
    atingimentoQtdPct: arredondar(linha.atingimento_quantidade_pct, CASAS_PCT),
    bateuQuantidade: linha.bateu_meta_quantidade === 1,
    metaValor: arredondar(linha.meta_valor, CASAS_REAIS) ?? 0,
    valorVendido: arredondar(linha.valor_vendido, CASAS_REAIS) ?? 0,
    atingimentoValorPct: arredondar(linha.atingimento_valor_pct, CASAS_PCT),
    bateuValor: linha.bateu_meta_valor === 1,
  }));

  return { porMes, mesMaisRecente: { anoMes, vendedores } };
}
