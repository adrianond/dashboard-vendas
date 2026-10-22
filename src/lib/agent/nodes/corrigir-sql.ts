import type { ConfigAgente } from "../config";
import type { ModelosAgente } from "../models";
import { promptCorrigirSql } from "../prompts/corrigir-sql";
import type { AtualizacaoEstado, EstadoAgente } from "../state";
import { atualizacaoDoSql } from "./gerar-sql";

// Recebe o erro de validação ou de execução (nunca vai ao usuário) e conta uma tentativa. A query
// corrigida volta sempre para o validarSql.
export function criarNoCorrigirSql({ modelos, config }: { modelos: ModelosAgente; config: ConfigAgente }) {
  return async (estado: EstadoAgente): Promise<AtualizacaoEstado> => {
    const atualizacao = await atualizacaoDoSql("corrigir_sql", () =>
      modelos.escreverSql(
        promptCorrigirSql({
          pergunta: estado.pergunta,
          historico: estado.historico,
          maxHistorico: config.maxHistorico,
          dataReferencia: config.dataReferencia,
          sqlAnterior: estado.sql ?? "",
          erro: estado.erroValidacao ?? estado.erroExecucao ?? "erro não informado",
        }),
      ),
    );
    return { ...atualizacao, tentativas: estado.tentativas + 1, erroValidacao: null, erroExecucao: null };
  };
}
