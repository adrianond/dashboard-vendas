# Progresso

## Etapa 1 — Fundação e dados (PRD-etapa-01-fundacao-e-dados.md)

| Passo | Status | Commit |
|---|---|---|
| 1.0 Regras de trabalho do Claude Code | ✅ concluído | 99cd22e |
| 1.1 Setup do projeto | ✅ concluído | 99cd22e |
| 1.2 Schema e migrations | ✅ concluído | bef0c74 |
| 1.3 Seed das entidades de cadastro | ✅ concluído | 3a8843b |
| 1.4 Seed de propostas, vendas e metas | ✅ concluído | af9e3a5 |
| 1.5 Verificação de integridade e testes | ✅ concluído | 51a9077 |
| 1.6 Documentação do schema e fechamento | ✅ concluído | 698802e |

Etapa 1 concluída. Critério 1 validado num clone limpo do GitHub: npm install + db:reset sem
erros, 133 testes passando e dados idênticos aos da cópia local.

## Etapa 2 — Agente text-to-SQL (PRD-etapa-02-agente-text-to-sql.md)

| Passo | Status | Commit |
|---|---|---|
| 2.0 Dependências e configuração | ✅ concluído | |
| 2.1 Validador de SQL | ⏳ próximo | |
| 2.2 Executor seguro | ⬜ | |
| 2.3 Estado, modelos e prompts | ⬜ | |
| 2.4 Nós e montagem do grafo | ⬜ | |
| 2.5 Observabilidade, Studio e CLI | ⬜ | |
| 2.6 Testes com LLM real e documentação | ⬜ | |

## Pendências e observações
- Preencher o hash do commit do passo 2.0 (b37c12f) (junto com o commit do passo 2.1).
- Passo 2.1 — sondagem do node-sql-parser 5.4.0 (dialeto sqlite), já feita:
  - os 17 blocos SQL do docs/schema.md são entendidos (1 SELECT cada, views corretas);
  - PRAGMA, VACUUM, BEGIN e SQL inválido não são entendidos → reprovam por falha fechada;
    ATTACH/INSERT/DROP aparecem com o tipo da instrução; múltiplas instruções aparecem como lista;
  - pragma_table_info(...) e load_extension(...) NÃO aparecem no tableList: percorrer a AST
    (nós `function`/`aggr_func`, inclusive no FROM);
  - WITH RECURSIVE aparece como `recursive: true`;
  - sqlify (SQL reconstruído da AST) preservou o resultado em 17 de 17 → usar como sqlNormalizado;
    nomes inexistentes entre aspas duplas dão erro no SQLite do better-sqlite3 (sem DQS).
- Passo 2.1 — decisões propostas, aguardando aprovação do desenvolvedor:
  - funções de janela: o parser sqlite só aceita `OVER (PARTITION BY ... ORDER BY ...)`; manter o
    dialeto sqlite (falha fechada) com orientação "use PARTITION BY (PARTITION BY 1 para todas as
    linhas)" no motivo e no prompt; ajustar a regra 7 da seção 8 do PRD 2;
  - instrução DENTRO de comentário: SELECT aprovado e comentário removido no sqlNormalizado;
    comentário SEPARANDO uma segunda instrução real: reprovado pela regra 3.
- statement.readonly é true para ATTACH e PRAGMA query_only = OFF é aceito por SQL: coberta
  pelas regras 4 e 9 da seção 8 do PRD 2; conferir no passo 2.1.
- Passo 2.2: o worker do executor deve abrir a conexão pelo readonly-client.ts (a regra de
  lint proíbe importar better-sqlite3 em src/lib/agent).
- Passo 2.3: confirmar no @langchain/anthropic instalado como passar thinking/effort e qual
  método do withStructuredOutput usa JSON schema.
- src/lib/agent usa imports relativos (o empacotador do `langgraph dev` pode não resolver o alias `@/`).
- faixa_etaria nas views usa date('now'), não DATA_REFERENCIA: respostas sobre faixa etária
  mudam com o tempo (reportado; views fora do escopo da Etapa 2).
- Etapa 3: import 'server-only' nos indicadores pode falhar fora do Next.js (vitest, tsx);
  tratar no passo 3.0.
