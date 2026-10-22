import { Annotation } from "@langchain/langgraph";
import type { Linha } from "./sql/executor";

// Estado do grafo (PRD da Etapa 2, seção 6.3).

export const CATEGORIAS_CLASSIFICADOR = ["ANALISE_VENDAS", "FORA_ESCOPO", "MANIPULACAO"] as const;
export type CategoriaClassificador = (typeof CATEGORIAS_CLASSIFICADOR)[number];
export type Categoria = CategoriaClassificador | "ENTRADA_INVALIDA";
export type Status = "OK" | "RECUSADO" | "FALHA";

// As linhas de resultado de trocas anteriores nunca entram no histórico (seção 6.4).
export type Troca = { pergunta: string; resposta: string; sql?: string };
export type RegistroGuardrail = { etapa: string; aprovado: boolean; motivo: string };

// Campo que guarda só o último valor escrito.
function ultimo<T>(padrao: () => T) {
  return Annotation<T>({ reducer: (_anterior, novo) => novo, default: padrao });
}

export const EstadoGrafo = Annotation.Root({
  pergunta: ultimo<string>(() => ""),
  historico: ultimo<Troca[]>(() => []),
  categoria: ultimo<Categoria | null>(() => null),
  sql: ultimo<string | null>(() => null),
  sqlExecutado: ultimo<string | null>(() => null),
  erroValidacao: ultimo<string | null>(() => null),
  erroExecucao: ultimo<string | null>(() => null),
  tentativas: ultimo<number>(() => 0),
  colunas: ultimo<string[]>(() => []),
  linhas: ultimo<Linha[]>(() => []),
  truncado: ultimo<boolean>(() => false),
  resposta: ultimo<string>(() => ""),
  status: ultimo<Status | null>(() => null),
  // Cada nó acrescenta os guardrails que aplicou; nada é sobrescrito.
  guardrails: Annotation<RegistroGuardrail[]>({
    reducer: (anteriores, novos) => anteriores.concat(novos),
    default: () => [],
  }),
});

export type EstadoAgente = typeof EstadoGrafo.State;
export type AtualizacaoEstado = typeof EstadoGrafo.Update;

// Contrato do resultado final, usado pela API da Etapa 3.
export type ResultadoAgente = {
  status: Status;
  resposta: string;
  sqlExecutado: string | null;
  colunas: string[];
  linhas: Linha[];
  truncado: boolean;
};
