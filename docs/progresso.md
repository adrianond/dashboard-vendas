# Progresso

## Ponto de retomada

- **Última sessão:** 2026-11-16. Resolvidas as pendências fora dos PRDs (comando de teste no
  CLAUDE.md, prazo do teste do grafo do Studio, `faixa_etaria` na data de referência) e iniciado o
  **passo 3.1 — Camada de indicadores**, pausado no meio (commit parcial `wip(indicadores)`).
- **Passo 3.1, feito:**
  - bloco 1: `server-only` instalado e alias no `vitest.config.mts` para o `empty.js` do pacote;
  - bloco 2: `src/lib/indicadores/filtros.ts` (domínios, `esquemaFiltros`, `lerFiltros`,
    `montarWhere` com placeholders nomeados, `COLUNAS_VENDA`/`COLUNAS_PROPOSTA`), 27 testes em
    `tests/indicadores.test.ts` e a regra do ESLint estendida a `src/lib/indicadores/**`.
  - Estado verificado: 387 testes passando (+2 pulados), typecheck e lint sem erros.
- **Próximo: bloco 3a** (`comum.ts`, `resumo.ts`, `serie-mensal.ts`, `index.ts` e os testes de
  consistência). O anúncio foi apresentado e **não foi aprovado**: refazer o anúncio ao retomar.
  Ele propunha: variação dos percentuais relativa em % (não em pontos percentuais), período
  anterior medido em dias e campos em camelCase.
- **Depois:** 3b (`por-regiao`, `por-unidade`, `por-tipo-veiculo`), 3c (rankings, com o schema de
  `limite`), 3d (`funil`, `metas`, `filtros`) e bloco 4 (verificação completa, decisões no README,
  `progresso.md` e o commit oficial `feat(indicadores): camada de indicadores fixos`).
- **Estado do repositório:** tudo commitado e enviado ao GitHub; nada fora do git.

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
| 3.0 Revisão do PRD contra o código real | ✅ concluído | e3fbbe3 |
| 3.1 Camada de indicadores | 🔄 em andamento (blocos 1 e 2 de 4) | parcial: commit `wip(indicadores)` |
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
| 02 | Testes: responsabilidade de cada arquivo e como executar (`02-testes.md`) | ✅ concluído | 41b20df |
| 03 | Fluxo de execução do grafo no LangGraph Studio (`03-fluxo-do-grafo.md`) | ✅ concluído | 1f7dcff |

## Pendências e observações
- src/lib/agent usa imports relativos (o empacotador do `langgraph dev` pode não resolver o alias `@/`).
- Resolvido (2026-11-16): faixa_etaria passou a usar a idade em 2026-09-30 (migration 0002,
  opção a do desenvolvedor). Mudar a DATA_REFERENCIA exige uma migration nova; um teste em
  tests/db.views.test.ts acusa a divergência.
- Passo 3.1, ao fechar: registrar no README (Decisões) o início padrão dos filtros (1º dia dos 12
  meses completos que terminam no mês do fim: 2025-10-01; o PRD diz só "12 meses antes"), os
  filtros com `.strict()` (parâmetro desconhecido é recusado) e as decisões dos blocos 3.
- Exceção ao "um commit por passo": o passo 3.1 tem um commit parcial (`wip(indicadores)`), feito a
  pedido do desenvolvedor para pausar a sessão; o commit oficial do passo vem no fim.
- npm 11.16 bloqueia scripts de instalação não aprovados (`allow-scripts`): num clone novo, o
  `better-sqlite3` (nativo) pode não compilar no `npm install`. Investigar e anunciar a solução
  (ex.: `npm approve-scripts better-sqlite3 esbuild unrs-resolver`, ou documentar) depois do 3.1.
- Passo 3.4: empacotar o processo filho do executor no Next.js (fork de um .ts com --import tsx;
  ver o ponto de atenção no README e a seção 7.6 do PRD).
- Passo 3.4: instalar @langchain/langgraph-checkpoint-sqlite com overrides para o better-sqlite3 13
  (decisão do desenvolvedor, opção b) e provar a persistência após reinício; se falhar, voltar
  para a cópia aninhada do better-sqlite3 12 (opção a), com anúncio.
- Passos 3.4/3.5: a entrada da API aceita só `pergunta` e o thread; o estado do grafo aceita
  qualquer campo, inclusive `historico` (ver docs/analise/03-fluxo-do-grafo.md, seção 8).
