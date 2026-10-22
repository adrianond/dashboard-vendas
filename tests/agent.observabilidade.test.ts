import { describe, expect, it } from "vitest";
import { metadadosDoTrace, modelosDaConfig, tagsDoTrace } from "@/lib/agent/observabilidade";
import { criarConfig } from "@/lib/agent/config";
import type { EstadoAgente } from "@/lib/agent/state";
import { env } from "@/lib/env";

// Camada 9 de segurança (PRD da Etapa 2, seção 10.1): metadados e tags dos traces. Nada aqui envia
// traces ao LangSmith.

const modelos = modelosDaConfig(criarConfig({ modelos: { rapido: "modelo-rapido", principal: "modelo-principal" } }));

function estado(parcial: Partial<EstadoAgente>): EstadoAgente {
  return {
    pergunta: "quantas vendas?",
    historico: [],
    categoria: "ANALISE_VENDAS",
    sql: "SELECT 1",
    sqlExecutado: "SELECT * FROM (SELECT 1) LIMIT 501",
    erroValidacao: null,
    erroExecucao: null,
    tentativas: 0,
    colunas: ["vendas"],
    linhas: [{ vendas: 1 }, { vendas: 2 }],
    truncado: false,
    resposta: "ok",
    status: "OK",
    guardrails: [{ etapa: "entrada", aprovado: true, motivo: "pergunta aceita" }],
    ...parcial,
  };
}

describe("tags do trace", () => {
  it("sempre têm a etapa e os modelos", () => {
    expect(tagsDoTrace(null, modelos)).toEqual(["etapa-2", "modelo-rapido", "modelo-principal"]);
    expect(tagsDoTrace(estado({}), modelos)).toEqual(["etapa-2", "modelo-rapido", "modelo-principal"]);
  });

  it("marcam guardrail-bloqueio quando algum guardrail reprovou", () => {
    const recusado = estado({
      status: "RECUSADO",
      guardrails: [
        { etapa: "entrada", aprovado: true, motivo: "pergunta aceita" },
        { etapa: "classificacao", aprovado: false, motivo: "MANIPULACAO: pede CPF" },
      ],
    });
    expect(tagsDoTrace(recusado, modelos)).toContain("guardrail-bloqueio");
  });
});

describe("metadados do trace", () => {
  it("trazem os campos da seção 10.1, com a quantidade de linhas (não as linhas)", () => {
    const metadados = metadadosDoTrace(estado({ tentativas: 1, truncado: true }), "t1");
    expect(metadados).toEqual({
      thread_id: "t1",
      categoria: "ANALISE_VENDAS",
      status: "OK",
      tentativas: 1,
      sqlExecutado: "SELECT * FROM (SELECT 1) LIMIT 501",
      linhas: 2,
      truncado: true,
      guardrails: [{ etapa: "entrada", aprovado: true, motivo: "pergunta aceita" }],
    });
  });
});

describe("grafo do Studio", () => {
  // Só cria o grafo (sem chamada à API); exige a chave, por isso roda apenas quando ela existe.
  it.skipIf(!env.ANTHROPIC_API_KEY)("a fábrica devolve o grafo com os 9 nós", async () => {
    const { graph } = await import("@/lib/agent");
    const grafo = graph();
    expect(graph()).toBe(grafo);
    const nos = Object.keys((await grafo.getGraphAsync()).nodes);
    expect(nos).toEqual(expect.arrayContaining(["validarEntrada", "classificarPergunta", "gerarResposta", "responderFalha"]));
    expect(nos).toHaveLength(9 + 2); // + __start__ e __end__
  });

  it("importar o módulo não exige a chave", async () => {
    await expect(import("@/lib/agent")).resolves.toHaveProperty("graph");
  });
});
