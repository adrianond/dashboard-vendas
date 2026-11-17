import "server-only";
import { somarMeses, type Filtros } from "./filtros";

// Utilitários compartilhados pelos indicadores (PRD da Etapa 3, seção 6.1): valores monetários
// com 2 casas e percentuais (0 a 100) com 1 casa.

export const CASAS_REAIS = 2;
export const CASAS_PCT = 1;

// null quando não há valor (ex.: média sem linhas, divisão por zero).
export function arredondar(valor: number | null | undefined, casas: number): number | null {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return null;
  const fator = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * fator) / fator;
}

export function percentual(parte: number, total: number): number | null {
  return total === 0 ? null : arredondar((parte * 100) / total, CASAS_PCT);
}

// Variação relativa, em %, em relação ao período anterior; null se não há base de comparação.
export function variacaoPct(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null || anterior === 0) return null;
  return arredondar(((atual - anterior) * 100) / Math.abs(anterior), CASAS_PCT);
}

export type Periodo = { inicio: string; fim: string };

function somarDias(data: string, dias: number): string {
  const resultado = new Date(`${data}T00:00:00Z`);
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado.toISOString().slice(0, 10);
}

function diasNoPeriodo({ inicio, fim }: Periodo): number {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000) + 1;
}

// Período anterior de mesmo tamanho, em dias, terminando na véspera do início.
export function periodoAnterior(periodo: Periodo): Periodo {
  const fim = somarDias(periodo.inicio, -1);
  return { inicio: somarDias(fim, -(diasNoPeriodo(periodo) - 1)), fim };
}

// Meses (AAAA-MM) cobertos pelo período, do mês do início ao mês do fim.
export function mesesDoPeriodo({ inicio, fim }: Pick<Filtros, "inicio" | "fim">): string[] {
  const meses: string[] = [];
  for (let mes = `${inicio.slice(0, 7)}-01`; mes.slice(0, 7) <= fim.slice(0, 7); mes = somarMeses(mes, 1)) {
    meses.push(mes.slice(0, 7));
  }
  return meses;
}
