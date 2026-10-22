import type { ConfigAgente } from "../config";
import type { AtualizacaoEstado, EstadoAgente } from "../state";
import { registro } from "./comum";

// Camada 5 de segurança (guardrail de entrada, sem LLM). Também é o início de cada pergunta: zera os
// campos do turno, que o checkpointer manteria da pergunta anterior no mesmo thread.

const CAMPOS_DO_TURNO = {
  categoria: null,
  sql: null,
  sqlExecutado: null,
  erroValidacao: null,
  erroExecucao: null,
  tentativas: 0,
  colunas: [],
  linhas: [],
  truncado: false,
  resposta: "",
  status: null,
} satisfies AtualizacaoEstado;

export function motivoEntradaInvalida(pergunta: string, maxChars: number): string | null {
  if (pergunta.length === 0) return "pergunta vazia";
  if (pergunta.length > maxChars) return `pergunta com ${pergunta.length} caracteres (máximo ${maxChars})`;
  if (!/[\p{L}\p{N}]/u.test(pergunta)) return "pergunta sem letras nem números";
  return null;
}

export function criarNoValidarEntrada({ config }: { config: ConfigAgente }) {
  return (estado: EstadoAgente): AtualizacaoEstado => {
    const pergunta = estado.pergunta.replace(/\s+/g, " ").trim();
    const motivo = motivoEntradaInvalida(pergunta, config.maxPerguntaChars);
    return {
      ...CAMPOS_DO_TURNO,
      pergunta,
      categoria: motivo ? "ENTRADA_INVALIDA" : null,
      guardrails: { reiniciarCom: [registro("entrada", motivo === null, motivo ?? "pergunta aceita")] },
    };
  };
}
