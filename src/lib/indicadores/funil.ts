import "server-only";
import { readonlyDb } from "../db/readonly-client";
import { CASAS_PCT, arredondar, percentual } from "./comum";
import { COLUNAS_PROPOSTA, montarWhere, type Filtros } from "./filtros";

// Indicador "funil" (PRD da Etapa 3, seção 6.3): propostas criadas no período (data_proposta) por
// status, conversão, motivos de perda e tempo médio até o fechamento.

export const STATUS_PROPOSTA = ["EM_NEGOCIACAO", "GANHA", "PERDIDA", "CANCELADA"] as const;
export type StatusProposta = (typeof STATUS_PROPOSTA)[number];

export type Funil = {
  total: number;
  porStatus: { status: StatusProposta; quantidade: number; pct: number | null }[];
  conversaoPct: number | null;
  motivosPerda: { motivo: string; quantidade: number; pct: number | null }[];
  tempoMedioFechamentoDias: number | null;
};

export function funil(filtros: Filtros): Funil {
  const { where, params } = montarWhere(filtros, COLUNAS_PROPOSTA);

  const contagem = new Map(
    (
      readonlyDb
        .prepare(`SELECT status, COUNT(*) AS n FROM vw_proposta_detalhada WHERE ${where} GROUP BY status`)
        .all(params) as { status: StatusProposta; n: number }[]
    ).map((linha) => [linha.status, linha.n]),
  );
  const quantidade = (status: StatusProposta) => contagem.get(status) ?? 0;
  const total = STATUS_PROPOSTA.reduce((soma, status) => soma + quantidade(status), 0);
  const fechadas = total - quantidade("EM_NEGOCIACAO");

  const motivos = readonlyDb
    .prepare(
      `SELECT motivo_perda AS motivo, COUNT(*) AS n FROM vw_proposta_detalhada
       WHERE ${where} AND status = 'PERDIDA'
       GROUP BY motivo_perda ORDER BY n DESC, motivo_perda`,
    )
    .all(params) as { motivo: string; n: number }[];

  const { dias } = readonlyDb
    .prepare(`SELECT AVG(dias_ate_fechamento) AS dias FROM vw_proposta_detalhada WHERE ${where} AND status <> 'EM_NEGOCIACAO'`)
    .get(params) as { dias: number | null };

  return {
    total,
    porStatus: STATUS_PROPOSTA.map((status) => ({ status, quantidade: quantidade(status), pct: percentual(quantidade(status), total) })),
    conversaoPct: percentual(quantidade("GANHA"), fechadas),
    motivosPerda: motivos.map((linha) => ({ motivo: linha.motivo, quantidade: linha.n, pct: percentual(linha.n, quantidade("PERDIDA")) })),
    tempoMedioFechamentoDias: arredondar(dias, CASAS_PCT),
  };
}
