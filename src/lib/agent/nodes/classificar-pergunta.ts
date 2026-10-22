import type { ConfigAgente } from "../config";
import type { ModelosAgente } from "../models";
import { promptClassificar } from "../prompts/classificar";
import type { AtualizacaoEstado, EstadoAgente } from "../state";
import { descreverErro, registro } from "./comum";

// Camada 5 de segurança (classificador de escopo/manipulação, antes de gerar SQL). Se o modelo
// falhar, a categoria fica nula e o grafo segue para responderFalha.
export function criarNoClassificarPergunta({ modelos, config }: { modelos: ModelosAgente; config: ConfigAgente }) {
  return async (estado: EstadoAgente): Promise<AtualizacaoEstado> => {
    try {
      const { categoria, motivo } = await modelos.classificar(
        promptClassificar({ pergunta: estado.pergunta, historico: estado.historico, maxHistorico: config.maxHistorico }),
      );
      return { categoria, guardrails: [registro("classificacao", categoria === "ANALISE_VENDAS", `${categoria}: ${motivo}`)] };
    } catch (erro) {
      return { categoria: null, guardrails: [registro("classificacao", false, `erro do modelo: ${descreverErro(erro)}`)] };
    }
  };
}
