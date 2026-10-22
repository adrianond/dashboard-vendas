import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { carregarSchema } from "../schema-context";
import type { Troca } from "../state";
import { AVISO_DADOS, delimitar, delimitarHistorico } from "./delimitar";
import { regrasSql } from "./gerar-sql";

// Prompt do nó corrigirSql (PRD da Etapa 2, seção 7.2). O erro vem do validador ou do banco e
// nunca chega ao usuário.

export function sistemaCorrigirSql(dataReferencia: string): string {
  return `Você é um especialista em SQL (SQLite) que corrige consultas de análise de vendas de uma rede de concessionárias de veículos. A consulta em <sql_anterior> foi escrita para responder a <pergunta> e falhou com o erro em <erro> (reprovação pelo validador de segurança ou erro do banco). Escreva uma nova consulta que corrija o problema e responda à pergunta. O schema disponível está em <schema>.

Em raciocinio, explique em até duas frases o que mudou em relação à consulta anterior. Se o erro mostrar que a pergunta não pode ser respondida com as views disponíveis, devolva sql = null.

${regrasSql(dataReferencia)}

${AVISO_DADOS}`;
}

export type DadosCorrigirSql = {
  pergunta: string;
  historico: Troca[];
  maxHistorico: number;
  dataReferencia: string;
  sqlAnterior: string;
  erro: string;
};

export function promptCorrigirSql(dados: DadosCorrigirSql): BaseMessage[] {
  return [
    new SystemMessage(sistemaCorrigirSql(dados.dataReferencia)),
    new HumanMessage(
      [
        delimitar("schema", carregarSchema()),
        delimitarHistorico(dados.historico, dados.maxHistorico, true),
        delimitar("pergunta", dados.pergunta),
        delimitar("sql_anterior", dados.sqlAnterior),
        delimitar("erro", dados.erro),
      ].join("\n\n"),
    ),
  ];
}
