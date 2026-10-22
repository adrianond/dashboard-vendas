import type { AtualizacaoEstado } from "../state";
import { SEM_RESULTADO } from "./comum";

// Mensagem genérica, sem LLM: o erro técnico nunca chega ao usuário (camada 7).
export const MENSAGEM_FALHA =
  "Não foi possível responder a essa pergunta agora. Tente reformulá-la, por exemplo indicando o " +
  "período, a unidade ou o produto de interesse.";

export const DESFECHO_FALHA = { ...SEM_RESULTADO, status: "FALHA", resposta: MENSAGEM_FALHA } satisfies AtualizacaoEstado;

export function criarNoResponderFalha() {
  return (): AtualizacaoEstado => DESFECHO_FALHA;
}
