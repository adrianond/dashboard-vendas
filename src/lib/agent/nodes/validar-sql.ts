import { validarSql } from "../sql/validator";
import type { AtualizacaoEstado, EstadoAgente } from "../state";
import { registro } from "./comum";

// Camada 3 de segurança: toda query passa por aqui antes de executar, inclusive as corrigidas.
export function criarNoValidarSql() {
  return (estado: EstadoAgente): AtualizacaoEstado => {
    const resultado = estado.sql === null ? { ok: false as const, motivo: "nenhum SQL para validar" } : validarSql(estado.sql);
    if (!resultado.ok) {
      return { erroValidacao: resultado.motivo, guardrails: [registro("validacao_sql", false, resultado.motivo)] };
    }
    return { sql: resultado.sqlNormalizado, erroValidacao: null, guardrails: [registro("validacao_sql", true, "aprovada")] };
  };
}
