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
| 2.3 Estado, modelos e prompts | ✅ concluído | 9539f8e |
| 2.4 Nós e montagem do grafo | ✅ concluído | 266d439 |
| 2.5 Observabilidade, Studio e CLI | ✅ concluído | f5c3735 |
| 2.6 Testes com LLM real e documentação | ✅ concluído | 2e42c19 |

Etapa 2 concluída. Critério 3: 5/5 recusas; referência aprovada (≥ 9/10) após a correção da
precisão do comparador (1ª execução 8/10, com as 2 falhas por arredondamento); db:check sem
violações. Fallback beta para recusas do Sonnet 5.5 mantido desligado (nenhuma recusa indevida).

## Etapa 3 — API e qualidade do agente (PRD-etapa-03-api-e-qualidade.md)

| Passo | Status | Commit |
|---|---|---|
| 3.0 Revisão do PRD contra o código real | ✅ concluído | (este commit) |
| 3.1 Camada de indicadores | ⏳ próximo | |
| 3.2 Infraestrutura da API | ⬜ | |
| 3.3 Rotas de indicadores e filtros | ⬜ | |
| 3.4 Runtime do agente na API | ⬜ | |
| 3.5 Rotas do agente | ⬜ | |
| 3.6 Testes ponta a ponta e de segurança | ⬜ | |
| 3.7 Datasets e avaliadores | ⬜ | |
| 3.8 Baseline | ⬜ | |
| 3.9 Ciclo de ajuste de prompts | ⬜ | |
| 3.10 Documentação e fechamento | ⬜ | |

Passo 3.0: 14 correções no PRD (D1–D14, ver "Histórico de alterações" do PRD).

## Análise do projeto (docs/analise/)

Série de documentos de análise pedida pelo desenvolvedor, fora dos passos dos PRDs. Não altera
código; o próximo passo da Etapa 3 continua sendo o 3.1.

| Nº | Documento | Status | Commit |
|---|---|---|---|
| 01 | Tabelas e entidades: onde são definidas e como são criadas (`01-tabelas-e-entidades.md`) | ✅ concluído | ba0ac69 |
| 02 | Testes: responsabilidade de cada arquivo e como executar (`02-testes.md`) | ✅ concluído | (este commit) |

## Pendências e observações
- Preencher o hash do commit do passo 3.0 (junto com o commit do passo 3.1).
- CLAUDE.md, seção 7: o comando de teste de um arquivo (`npx vitest run tests/...`) cai com
  segfault no Windows; trocar por `npm test -- tests/<arquivo>.test.ts` se o desenvolvedor aprovar.
- src/lib/agent usa imports relativos (o empacotador do `langgraph dev` pode não resolver o alias `@/`).
- faixa_etaria nas views usa date('now'), não DATA_REFERENCIA: respostas sobre faixa etária
  mudam com o tempo (reportado; views fora do escopo da Etapa 2).
- Passo 3.1: instalar o pacote server-only e criar o alias no vitest para o módulo vazio do
  pacote (PRD 6.1).
- Passo 3.4: empacotar o processo filho do executor no Next.js (fork de um .ts com --import tsx;
  ver o ponto de atenção no README e a seção 7.6 do PRD).
- Passo 3.4: instalar @langchain/langgraph-checkpoint-sqlite com overrides para o better-sqlite3 13
  (decisão do desenvolvedor, opção b) e provar a persistência após reinício; se falhar, voltar
  para a cópia aninhada do better-sqlite3 12 (opção a), com anúncio.
