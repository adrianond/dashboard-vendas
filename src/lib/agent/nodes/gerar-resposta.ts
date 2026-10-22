import type { ConfigAgente } from "../config";
import type { ModelosAgente } from "../models";
import { promptResponder } from "../prompts/responder";
import { verificarSaida } from "../saida";
import type { AtualizacaoEstado, EstadoAgente, Troca } from "../state";
import { descreverErro, registro } from "./comum";
import { DESFECHO_FALHA } from "./responder-falha";

// Gera a resposta e aplica o guardrail de saída (camada 7). Só trocas com status OK entram no
// histórico, para recusas e falhas não virarem contexto das próximas perguntas.
export function criarNoGerarResposta({ modelos, config }: { modelos: ModelosAgente; config: ConfigAgente }) {
  return async (estado: EstadoAgente): Promise<AtualizacaoEstado> => {
    let resposta: string;
    try {
      const resultado = {
        sqlExecutado: estado.sqlExecutado ?? "",
        colunas: estado.colunas,
        linhas: estado.linhas,
        truncado: estado.truncado,
      };
      resposta = (await modelos.responder(promptResponder({ pergunta: estado.pergunta, resultado, limites: config }))).trim();
    } catch (erro) {
      return { ...DESFECHO_FALHA, guardrails: [registro("resposta", false, `erro do modelo: ${descreverErro(erro)}`)] };
    }

    const motivo = resposta ? verificarSaida(resposta) : "resposta vazia";
    if (motivo) return { ...DESFECHO_FALHA, guardrails: [registro("saida", false, motivo)] };

    const troca: Troca = { pergunta: estado.pergunta, resposta, ...(estado.sql ? { sql: estado.sql } : {}) };
    return {
      status: "OK",
      resposta,
      historico: [...estado.historico, troca].slice(-config.maxHistorico),
      guardrails: [registro("saida", true, "resposta aprovada")],
    };
  };
}
