import { configPadrao } from "./config";
import { createAgent } from "./graph";
import { criarModelosAnthropic } from "./models";
import { NOME_DO_TRACE, modelosDaConfig, tagsDoTrace } from "./observabilidade";

// Ponto de entrada do agente.
export { createAgent, extrairResultado, type Agente, type OpcoesAgente } from "./graph";
export { criarModelosAnthropic, type ModelosAgente } from "./models";
export { perguntarComRastreamento, type Execucao } from "./observabilidade";
export type { EstadoAgente, ResultadoAgente, Status, Troca } from "./state";

// Grafo do LangGraph Studio (langgraph.json): modelos e executor reais, sem checkpointer (o servidor
// cuida da persistência). É uma fábrica, chamada pelo servidor só quando precisa do grafo, para que
// importar este módulo não exija a ANTHROPIC_API_KEY.
let grafoDoStudio: ReturnType<typeof criarGrafoDoStudio> | undefined;

function criarGrafoDoStudio() {
  return createAgent({ modelos: criarModelosAnthropic(configPadrao), checkpointer: false }).withConfig({
    runName: NOME_DO_TRACE,
    tags: tagsDoTrace(null, modelosDaConfig(configPadrao)),
  });
}

export const graph = () => (grafoDoStudio ??= criarGrafoDoStudio());
