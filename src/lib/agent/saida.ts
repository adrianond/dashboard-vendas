// Camada 7 de segurança (PRD da Etapa 2, seção 7.3): verificação determinística da resposta final,
// sem LLM. Barra nomes de tabelas base, trechos de SQL e padrões de dados pessoais.

// Tabelas base do banco (src/lib/db/schema.ts). Lista fixa para o agente não importar o schema das
// tabelas; tests/agent.graph.test.ts confere que ela acompanha o schema.
export const TABELAS_BASE = ["unidade", "vendedor", "cliente", "produto", "proposta", "venda", "meta_vendedor"] as const;

const TABELAS = TABELAS_BASE.join("|");

const PADROES: [motivo: string, padrao: RegExp][] = [
  // "proposta.status" (minúsculas, como no SQL); "a venda. Em" não é identificador.
  ["nome de tabela base", new RegExp(`\\b(?:${TABELAS})\\.[a-z_]`)],
  ["nome de tabela base em SQL", new RegExp(`\\b(?:FROM|JOIN)\\s+(?:${TABELAS})\\b`, "i")],
  ["trecho de SQL", /\bSELECT\b/i],
  ["nome de view", /\bvw_\w+/i],
  ["CPF", /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/],
  ["CNPJ", /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/],
  ["CPF ou CNPJ sem pontuação", /(?<![\d.,])\d{11}(?:\d{3})?(?![\d.,])/],
  ["e-mail", /[\w.+-]+@[\w-]+\.[\w.]+/],
  ["telefone", /\(\d{2}\)\s?9?\d{4}-?\d{4}|\b\d{2}\s9\d{4}-\d{4}\b/],
];

// Devolve o motivo da reprovação, ou null se a resposta pode ir ao usuário.
export function verificarSaida(resposta: string): string | null {
  const encontrado = PADROES.find(([, padrao]) => padrao.test(resposta));
  return encontrado ? `resposta contém ${encontrado[0]}` : null;
}
