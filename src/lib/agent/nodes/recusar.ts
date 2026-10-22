import type { ConfigAgente } from "../config";
import type { AtualizacaoEstado, Categoria, EstadoAgente } from "../state";
import { SEM_RESULTADO } from "./comum";

// Mensagens fixas por motivo, sem LLM, para a recusa não ser manipulável.
export function mensagemDeRecusa(categoria: Categoria | null, maxPerguntaChars: number): string {
  switch (categoria) {
    case "ENTRADA_INVALIDA":
      return `Não consegui entender a pergunta. Escreva uma pergunta sobre vendas com até ${maxPerguntaChars} caracteres.`;
    case "FORA_ESCOPO":
      return "Só consigo responder perguntas sobre vendas, propostas, metas, produtos, unidades e vendedores da rede.";
    default:
      return (
        "Não posso atender a esse pedido. Posso responder perguntas de análise sobre vendas, propostas, " +
        "metas, produtos, unidades e vendedores, sem dados pessoais e sem alterar informações."
      );
  }
}

export function criarNoRecusar({ config }: { config: ConfigAgente }) {
  return (estado: EstadoAgente): AtualizacaoEstado => ({
    ...SEM_RESULTADO,
    status: "RECUSADO",
    resposta: mensagemDeRecusa(estado.categoria, config.maxPerguntaChars),
  });
}
