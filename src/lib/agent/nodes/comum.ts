import type { AtualizacaoEstado, RegistroGuardrail } from "../state";

// Auxiliares compartilhados pelos nós.

const MAX_ERRO_CHARS = 300;

export function registro(etapa: string, aprovado: boolean, motivo: string): RegistroGuardrail {
  return { etapa, aprovado, motivo };
}

// Descrição técnica de uma exceção, só para guardrails/trace (nunca vai ao usuário).
export function descreverErro(erro: unknown): string {
  const texto = erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro);
  return texto.length > MAX_ERRO_CHARS ? `${texto.slice(0, MAX_ERRO_CHARS)}…` : texto;
}

// Recusas e falhas não devolvem resultado (nem o SQL executado).
export const SEM_RESULTADO = {
  sqlExecutado: null,
  colunas: [],
  linhas: [],
  truncado: false,
} satisfies AtualizacaoEstado;
