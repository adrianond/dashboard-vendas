import { END, MemorySaver, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";
import { configPadrao, type ConfigAgente } from "./config";
import type { ModelosAgente } from "./models";
import { criarNoClassificarPergunta } from "./nodes/classificar-pergunta";
import { criarNoCorrigirSql } from "./nodes/corrigir-sql";
import { criarNoExecutarSql } from "./nodes/executar-sql";
import { criarNoGerarResposta } from "./nodes/gerar-resposta";
import { criarNoGerarSql } from "./nodes/gerar-sql";
import { criarNoRecusar } from "./nodes/recusar";
import { DESFECHO_FALHA, criarNoResponderFalha } from "./nodes/responder-falha";
import { criarNoValidarEntrada } from "./nodes/validar-entrada";
import { criarNoValidarSql } from "./nodes/validar-sql";
import { criarExecutor, type SqlExecutor } from "./sql/executor";
import { EstadoGrafo, type EstadoAgente, type ResultadoAgente } from "./state";

// Montagem do grafo (PRD da Etapa 2, seção 6.1). As rotas são funções puras sobre o estado.
// Não existe caminho de corrigirSql direto para executarSql: toda query passa pelo validarSql.

export function rotaAposEntrada(estado: EstadoAgente) {
  return estado.categoria === "ENTRADA_INVALIDA" ? "recusar" : "classificarPergunta";
}

export function rotaAposClassificacao(estado: EstadoAgente) {
  if (estado.categoria === "ANALISE_VENDAS") return "gerarSql";
  if (estado.categoria === "FORA_ESCOPO" || estado.categoria === "MANIPULACAO") return "recusar";
  return "responderFalha"; // o classificador falhou
}

export function rotaAposEscritaDoSql(estado: EstadoAgente) {
  return estado.sql === null ? "responderFalha" : "validarSql";
}

export function rotaAposValidacao(estado: EstadoAgente, maxTentativas: number) {
  if (estado.erroValidacao === null) return "executarSql";
  return estado.tentativas < maxTentativas ? "corrigirSql" : "responderFalha";
}

export function rotaAposExecucao(estado: EstadoAgente, maxTentativas: number) {
  if (estado.erroExecucao === null) return "gerarResposta";
  return estado.tentativas < maxTentativas ? "corrigirSql" : "responderFalha";
}

export type OpcoesAgente = {
  modelos: ModelosAgente;
  config?: ConfigAgente;
  executor?: SqlExecutor;
  // Padrão: MemorySaver. false = sem checkpointer (o servidor do LangGraph Studio cuida da persistência).
  checkpointer?: BaseCheckpointSaver | false;
};

export function createAgent({
  modelos,
  config = configPadrao,
  executor = criarExecutor(config),
  checkpointer = new MemorySaver(),
}: OpcoesAgente) {
  const dependencias = { modelos, config, executor };
  return new StateGraph(EstadoGrafo)
    .addNode("validarEntrada", criarNoValidarEntrada(dependencias))
    .addNode("classificarPergunta", criarNoClassificarPergunta(dependencias))
    .addNode("gerarSql", criarNoGerarSql(dependencias))
    .addNode("validarSql", criarNoValidarSql())
    .addNode("executarSql", criarNoExecutarSql(dependencias))
    .addNode("corrigirSql", criarNoCorrigirSql(dependencias))
    .addNode("gerarResposta", criarNoGerarResposta(dependencias))
    .addNode("recusar", criarNoRecusar(dependencias))
    .addNode("responderFalha", criarNoResponderFalha())
    .addEdge(START, "validarEntrada")
    .addConditionalEdges("validarEntrada", rotaAposEntrada, ["recusar", "classificarPergunta"])
    .addConditionalEdges("classificarPergunta", rotaAposClassificacao, ["gerarSql", "recusar", "responderFalha"])
    .addConditionalEdges("gerarSql", rotaAposEscritaDoSql, ["validarSql", "responderFalha"])
    .addConditionalEdges("corrigirSql", rotaAposEscritaDoSql, ["validarSql", "responderFalha"])
    .addConditionalEdges("validarSql", (estado) => rotaAposValidacao(estado, config.maxTentativas), [
      "executarSql",
      "corrigirSql",
      "responderFalha",
    ])
    .addConditionalEdges("executarSql", (estado) => rotaAposExecucao(estado, config.maxTentativas), [
      "gerarResposta",
      "corrigirSql",
      "responderFalha",
    ])
    .addEdge("gerarResposta", END)
    .addEdge("recusar", END)
    .addEdge("responderFalha", END)
    .compile({ checkpointer: checkpointer === false ? undefined : checkpointer });
}

export type Agente = ReturnType<typeof createAgent>;

// Contrato do resultado final para quem chama o agente (CLI, API da Etapa 3).
export function extrairResultado(estado: EstadoAgente): ResultadoAgente {
  if (estado.status === null) return DESFECHO_FALHA;
  const { status, resposta, sqlExecutado, colunas, linhas, truncado } = estado;
  return { status, resposta, sqlExecutado, colunas, linhas, truncado };
}
