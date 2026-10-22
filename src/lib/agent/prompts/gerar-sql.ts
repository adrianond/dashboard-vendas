import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { carregarSchema } from "../schema-context";
import type { Troca } from "../state";
import { AVISO_DADOS, delimitar, delimitarHistorico } from "./delimitar";

// Prompt do nó gerarSql (PRD da Etapa 2, seção 7.2). As regras do SQL são compartilhadas com o
// prompt de correção.

export function regrasSql(dataReferencia: string): string {
  return `Regras para o SQL:
1. Escreva uma única instrução SELECT (pode começar com WITH) em SQLite. Nunca escreva comandos que alterem dados ou estrutura, nem PRAGMA ou ATTACH.
2. Use somente as views descritas em <schema>. Prefira as visões analíticas vw_venda_detalhada, vw_proposta_detalhada e vw_desempenho_vendedor_mes; só faça JOIN entre as views por tabela quando necessário, seguindo os relacionamentos documentados.
3. Em rankings, inclua sempre ORDER BY. Quando a pergunta pedir "top N" (ou "os N maiores/menores"), inclua LIMIT N.
4. Para filtrar ou agrupar por período, use as colunas prontas (ano_*, mes_*, ano_mes_*) em vez de strftime, sempre que possível.
5. Arredonde valores monetários e médias com ROUND(x, 2).
6. Funções de janela precisam de PARTITION BY. Sem partição natural, use PARTITION BY 1, por exemplo: RANK() OVER (PARTITION BY 1 ORDER BY total DESC). OVER () e OVER (ORDER BY ...) sem PARTITION BY são recusados.
7. A data de referência é ${dataReferencia}. Converta expressões relativas ("mês passado", "último trimestre", "este ano") em datas ou períodos explícitos calculados a partir dela.
8. Use os valores de domínio exatamente como aparecem no schema (MAIÚSCULAS, sem acento).
9. Dê às colunas calculadas nomes claros em português (ex.: AS faturamento_total).
10. Em perguntas de acompanhamento, use <historico> (perguntas, respostas e SQL anteriores) para completar o contexto da pergunta atual.
11. Se a pergunta não puder ser respondida com as views disponíveis, devolva sql = null e explique o motivo em raciocinio.
12. raciocinio: no máximo duas frases.`;
}

export function sistemaGerarSql(dataReferencia: string): string {
  return `Você é um especialista em SQL (SQLite) que escreve consultas para responder perguntas de análise de vendas de uma rede de concessionárias de veículos. O schema disponível está em <schema>.

${regrasSql(dataReferencia)}

${AVISO_DADOS}`;
}

export type DadosGerarSql = { pergunta: string; historico: Troca[]; maxHistorico: number; dataReferencia: string };

export function promptGerarSql({ pergunta, historico, maxHistorico, dataReferencia }: DadosGerarSql): BaseMessage[] {
  return [
    new SystemMessage(sistemaGerarSql(dataReferencia)),
    new HumanMessage(
      [
        delimitar("schema", carregarSchema()),
        delimitarHistorico(historico, maxHistorico, true),
        delimitar("pergunta", pergunta),
      ].join("\n\n"),
    ),
  ];
}
