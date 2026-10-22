import type { ConfigAgente } from "../config";
import type { ModelosAgente, SqlGerado } from "../models";
import { promptGerarSql } from "../prompts/gerar-sql";
import type { AtualizacaoEstado, EstadoAgente } from "../state";
import { descreverErro, registro } from "./comum";

// sql = null (o modelo disse que não dá para responder, ou falhou) leva a responderFalha, sem correção.
export function atualizacaoDoSql(etapa: string, gerar: () => Promise<SqlGerado>): Promise<AtualizacaoEstado> {
  return gerar().then(
    ({ sql, raciocinio }) => {
      const limpo = sql?.trim() || null;
      return limpo ? { sql: limpo } : { sql: null, guardrails: [registro(etapa, false, `sem SQL: ${raciocinio}`)] };
    },
    (erro: unknown) => ({ sql: null, guardrails: [registro(etapa, false, `erro do modelo: ${descreverErro(erro)}`)] }),
  );
}

export function criarNoGerarSql({ modelos, config }: { modelos: ModelosAgente; config: ConfigAgente }) {
  return (estado: EstadoAgente): Promise<AtualizacaoEstado> =>
    atualizacaoDoSql("gerar_sql", () =>
      modelos.escreverSql(
        promptGerarSql({
          pergunta: estado.pergunta,
          historico: estado.historico,
          maxHistorico: config.maxHistorico,
          dataReferencia: config.dataReferencia,
        }),
      ),
    );
}
