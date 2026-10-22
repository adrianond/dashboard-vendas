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
| 2.0 Dependências e configuração | ✅ concluído | b37c12f |
| 2.1 Validador de SQL | ✅ concluído | 44662ae |
| 2.2 Executor seguro | ✅ concluído | cc91b00 |
| 2.3 Estado, modelos e prompts | ✅ concluído | (este commit) |
| 2.4 Nós e montagem do grafo | ⏳ próximo | |
| 2.5 Observabilidade, Studio e CLI | ⬜ | |
| 2.6 Testes com LLM real e documentação | ⬜ | |

## Pendências e observações
- Preencher o hash do commit do passo 2.3 (junto com o commit do passo 2.4).
- vitest: o processo cai com segfault ao empacotar o vitest.config.mts (rolldown no Windows),
  dentro e fora do sandbox. Contorno: `npx vitest run --configLoader runner`. Decidir se o
  script "test" do package.json passa a usar a flag.
- Passo 2.6: reavaliar o fallback beta (fallbacks: "default") para recusas no Sonnet 5.5
  (decidido não ligar no 2.3). Os parâmetros dos modelos ainda não foram testados com a API real.
- src/lib/agent usa imports relativos (o empacotador do `langgraph dev` pode não resolver o alias `@/`).
- faixa_etaria nas views usa date('now'), não DATA_REFERENCIA: respostas sobre faixa etária
  mudam com o tempo (reportado; views fora do escopo da Etapa 2).
- Etapa 3: import 'server-only' nos indicadores pode falhar fora do Next.js (vitest, tsx);
  tratar no passo 3.0.
- Etapa 3: empacotar o processo filho do executor (fork de um .ts com --import tsx; ver o ponto
  de atenção no README).
