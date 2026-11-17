# Progresso

## Ponto de retomada

- **Última sessão:** 2026-11-17. Passo 3.1 concluído e aprovado (`6d3b575`); `allowScripts` do npm
  resolvido (`31eb1c9`). **Passo 3.2 — Infraestrutura da API em andamento**, pausado antes da
  verificação com `curl` (commit parcial `wip(api)`).
- **Passo 3.2, feito (código pronto e testado):**
  - `src/lib/api/`: `errors.ts` (7 códigos do PRD 7.1), `body.ts` (JSON, 415, 8 KB lidos no stream),
    `rate-limit.ts` (janela deslizante em memória; agente minuto+dia; chave fixa sem TRUST_PROXY,
    último endereço do x-forwarded-for com proxy), `handler.ts` (`criarRota`, requestId, log JSON
    sem corpo, ERRO_INTERNO sem vazar; `lerConsulta`), `health.ts`;
  - rota `src/app/api/health/route.ts`; cabeçalhos de segurança e `poweredByHeader: false` no
    `next.config.ts`; 6 variáveis novas no `env.ts`/`.env.example` (AGENT_MODE, TRUST_PROXY,
    RATE_LIMIT_*);
  - 42 testes em `tests/api.unit.test.ts` (inclui: nenhuma rota exporta `runtime`/`dynamic`);
    suíte com 482 testes (+2 pulados), typecheck e lint sem erros;
  - correção do PRD 7.1 (rotas sem `export const runtime`, que o Next 16.4 recusa com
    `cacheComponents`), registrada no Histórico do PRD.
- Bloqueio resolvido: o `next dev` encerrava sozinho por avisos de segurança do `next@16.4.0`.
  Atualizados `next` 16.4.6 (2 RCE críticas, 1 DoS), `eslint-config-next` 16.4.6 e `zod` 4.6.7
  (DoS na validação), em commit próprio `fix(deps)`. Ver README.
- **Próximo:** refazer a verificação do 3.2 (`npm run dev` + `curl`: 200 no GET de `/api/health`
  com os cabeçalhos de segurança, 405 no POST), registrar as decisões do 3.2 no README e fazer o
  commit oficial `feat(api): infraestrutura comum, rate limit e cabeçalhos de segurança`.
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
| 3.1 Camada de indicadores | ✅ concluído | f5ad4f6 (parcial) + 6d3b575 |
| 3.2 Infraestrutura da API | 🔄 em andamento (código pronto; falta a verificação com curl) | parcial: commit `wip(api)` |
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
- Passo 3.3: criar `docs/api.md` (PRD 6.2 e 7.7) documentando, entre outros, a data de corte de
  cada indicador (vendas por data_venda; propostas/funil por data_proposta; metas por ano_mes).
- Exceção ao "um commit por passo": os passos 3.1 e 3.2 têm commits parciais (`wip(indicadores)` e
  `wip(api)`), feitos a pedido do desenvolvedor para pausar a sessão; o commit oficial vem no fim.
- Resolvido (2026-11-17): `next` 16.4.0 → 16.4.6 e `zod` → 4.6.7 por vulnerabilidades críticas e
  altas. Pendente, depois do 3.2: revisar os 17 avisos restantes do `npm audit`, todos de
  ferramentas de desenvolvimento (hono do `langgraph dev`, extract-zip, esbuild via drizzle-kit,
  typescript-eslint/minimatch).
- Passo 3.2, ao fechar: registrar no README (Decisões) as variáveis novas, o rate limit em memória
  (instância única; chave fixa sem TRUST_PROXY; último endereço do x-forwarded-for), a CSP com
  'unsafe-inline' até a Etapa 4 adotar nonce ('unsafe-eval' só em dev), o health no limite dos
  indicadores e o log só com o tipo do erro interno.
- Resolvido (2026-11-17): `allowScripts` do npm 11.16 (hoje só consultivo; o bloqueio virá numa
  versão futura). Aprovados com versão fixa better-sqlite3, esbuild (3 versões) e unrs-resolver.
  Depois de atualizar dependências: `npm approve-scripts --allow-scripts-pending`.
- Passo 3.4: empacotar o processo filho do executor no Next.js (fork de um .ts com --import tsx;
  ver o ponto de atenção no README e a seção 7.6 do PRD).
- Passo 3.4: instalar @langchain/langgraph-checkpoint-sqlite com overrides para o better-sqlite3 13
  (decisão do desenvolvedor, opção b) e provar a persistência após reinício; se falhar, voltar
  para a cópia aninhada do better-sqlite3 12 (opção a), com anúncio.
- Passos 3.4/3.5: a entrada da API aceita só `pergunta` e o thread; o estado do grafo aceita
  qualquer campo, inclusive `historico` (ver docs/analise/03-fluxo-do-grafo.md, seção 8).
