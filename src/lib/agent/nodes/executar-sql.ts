import { aplicarLimite, type SqlExecutor } from "../sql/executor";
import type { ConfigAgente } from "../config";
import type { AtualizacaoEstado, EstadoAgente } from "../state";
import { descreverErro, registro } from "./comum";

// Camada 4 de segurança. Resultado vazio não é erro: segue para gerarResposta.
export function criarNoExecutarSql({ executor, config }: { executor: SqlExecutor; config: ConfigAgente }) {
  return async (estado: EstadoAgente): Promise<AtualizacaoEstado> => {
    const sql = estado.sql ?? "";
    // O executor real nunca rejeita; a proteção cobre executores injetados.
    const resultado = await executor.executar(sql).catch((erro: unknown) => ({
      ok: false as const,
      sqlExecutado: aplicarLimite(sql, config.maxLinhas),
      erro: descreverErro(erro),
    }));
    if (!resultado.ok) {
      return {
        sqlExecutado: resultado.sqlExecutado,
        erroExecucao: resultado.erro,
        guardrails: [registro("execucao_sql", false, resultado.erro)],
      };
    }
    const { sqlExecutado, colunas, linhas, truncado } = resultado;
    return {
      sqlExecutado,
      colunas,
      linhas,
      truncado,
      erroExecucao: null,
      guardrails: [registro("execucao_sql", true, `${linhas.length} linha(s)${truncado ? ", truncado" : ""}`)],
    };
  };
}
