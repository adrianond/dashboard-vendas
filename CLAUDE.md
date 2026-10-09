# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Projeto:** Dashboard de Vendas de Veículos (rede de concessionárias franqueadas). Aplicação Next.js full-stack em que o usuário faz perguntas em linguagem natural e um grafo LangGraph gera, executa e corrige SQL sobre um banco SQLite.

O projeto é construído em etapas, cada uma com seu PRD na raiz do repositório (ex.: `PRD-etapa-01-fundacao-e-dados.md`). O PRD da etapa em andamento é a especificação do que construir; este arquivo contém as regras permanentes de **como** trabalhar, válidas em todas as etapas.

---

## 1. Protocolo de execução: anunciar → confirmar → executar (obrigatório)

Esta regra vale para **toda a execução deste PRD e de todas as etapas seguintes do projeto**, e tem prioridade sobre qualquer outra instrução.

Antes de **qualquer ação que altere algo**, o Claude Code para, apresenta o plano da ação e **aguarda a confirmação explícita do desenvolvedor** ("sim", "ok", "pode", "confirmo"). Sem confirmação, nada é executado.

**Exigem confirmação:**
- criar, editar, mover, renomear ou apagar arquivos e pastas;
- qualquer comando que altere estado: `npm install`/`uninstall`, `npx`, `create-next-app`, migrations, seed, `db:reset`, build, scripts do projeto, comandos no banco;
- qualquer comando `git` que altere o repositório (`init`, `add`, `commit`, `checkout`, `reset`, `stash`, `merge` etc.);
- alterar configuração (`package.json`, `tsconfig.json`, `next.config.ts`, `drizzle.config.ts`, `.env*`, `.claude/`);
- qualquer acesso à rede além de leitura de documentação.

**Dispensam confirmação** (mas devem ser mencionadas brevemente): apenas leituras, como abrir e ler arquivos, listar pastas, buscar no código, `git status`, `git diff` e `git log`.

**Formato obrigatório do anúncio:**

```
🔧 Próxima ação: <resumo em uma linha>
Passo do PRD: <ex.: 1.2 — Schema e migrations>

O que será feito:
1. <comando exato ou arquivo a criar/editar>
2. ...

Arquivos afetados: <lista>
Por quê: <motivo curto>
Riscos / reversão: <ex.: "apaga data/vendas.db; recria com db:reset">

Posso executar? (sim / não / ajustar)
```

**Regras do protocolo:**
- Agrupar ações relacionadas num único anúncio, mas nunca misturar tarefas de passos diferentes.
- Mostrar os comandos exatamente como serão executados, sem abreviar.
- Ao criar ou editar código, descrever o conteúdo do arquivo e o motivo; mostrar o conteúdo completo ou o diff antes de gravar sempre que o desenvolvedor pedir.
- Marcar ações destrutivas (apagar, sobrescrever, `db:reset`, `git reset`) com ⚠️.
- Se algo falhar ou o plano mudar no meio da execução, parar e anunciar o novo plano. Não aplicar correções por conta própria sem nova confirmação.
- Resposta "não" ou "ajustar": não executar nada, discutir o ajuste e anunciar de novo.
- Depois de executar, informar o resultado em poucas linhas (sucesso ou erro, saída relevante) antes de anunciar a próxima ação.

**Persistência entre sessões e etapas:** este protocolo está gravado neste `CLAUDE.md` (lido automaticamente em toda sessão), e o `.claude/settings.json` impede os modos que pulam aprovação. Assim a regra continua valendo em todas as etapas, mesmo em sessões novas.

**Observação para o desenvolvedor:** ao aprovar comandos na tela de permissão do Claude Code, escolha "Yes", e não "Yes, and don't ask again". A segunda opção libera aquele comando de forma permanente no repositório.

---

## 2. Fluxo por passos

Os passos do PRD da etapa são executados **na ordem**, um de cada vez. Ao concluir cada passo:

1. rode a verificação do passo;
2. faça um commit com a mensagem indicada no PRD;
3. **pare e apresente um resumo** (o que foi feito, resultado da verificação, decisões tomadas) e aguarde aprovação antes de seguir para o próximo passo.

Não adiante tarefas de passos seguintes. Dentro de cada passo, toda ação que altere algo (criar/editar arquivo, rodar comando, instalar pacote, commit) segue o protocolo da seção 1.

## 3. Regras gerais

- Siga o protocolo da seção 1 em toda a execução. Em especial, **nenhuma ação que altere arquivos, dependências, banco ou git é executada sem anúncio prévio e confirmação explícita do desenvolvedor**.
- Trabalhe apenas no escopo da etapa em andamento e siga os passos do PRD em ordem. Não avance para etapas seguintes, mesmo que pareça natural.
- Se alguma regra do PRD for ambígua ou conflitante, registre a decisão na seção "Decisões" do `README.md` e mencione-a no resumo do passo, em vez de inventar escopo novo.
- Não altere os PRDs. Sugestões de mudança vão no resumo do passo.
- Nunca relaxe uma regra de segurança (seção 4) para fazer algo funcionar. Se uma regra impedir o progresso, pare e reporte.

## 4. Segurança (defesa em camadas)

**Premissas:** toda pergunta do usuário é entrada não confiável (pode conter injeção de prompt); todo SQL gerado pelo LLM é não confiável, mesmo depois de corrigido; nenhuma camada isolada é suficiente. **O LLM só lê**: escrita, alteração de estrutura e acesso a dados pessoais são proibidos.

Regras inegociáveis:
- **O agente (`src/lib/agent`) usa exclusivamente `src/lib/db/readonly-client.ts`** (arquivo aberto com `readonly: true` + `PRAGMA query_only = ON`). A conexão de escrita `src/lib/db/client.ts` é usada só por migrations, seed e scripts, e **nunca** é importada pelo código do agente.
- **O LLM só conhece e só consulta as views `vw_*`** (lista em `ALLOWED_VIEWS`, `src/lib/db/views.ts`), sem dados pessoais nem texto livre. O schema das tabelas base nunca vai para o prompt; `docs/schema.md` descreve apenas as views.
- Toda coluna de tabela base está exposta em alguma view ou listada em `EXCLUDED_COLUMNS` com motivo. Coluna nova exige essa decisão consciente.
- Views são construídas diretamente sobre as tabelas base (nunca sobre outras views) e não têm triggers.
- **Nunca expor segredos:** não ler `.env.local`, não imprimir chaves, nenhuma variável com prefixo `NEXT_PUBLIC_`.

| # | Camada | Etapa |
|---|---|---|
| 1 | Banco: conexão somente leitura exclusiva do agente | 1 |
| 2 | Dados: apenas views `vw_*`, sem dados pessoais | 1 |
| 3 | Validação do SQL com parser (1 instrução `SELECT`, só `ALLOWED_VIEWS`, sem `PRAGMA`/`ATTACH`/`sqlite_master`, `statement.readonly`) | 2 |
| 4 | Limites de execução (`LIMIT` ≤ 500, timeout em worker thread, máx. 3 correções, limite de tokens) | 2 |
| 5 | Guardrails de entrada (tamanho máximo, classificador de escopo/manipulação antes de gerar SQL) | 2 |
| 6 | Prompt (regras explícitas; pergunta e resultados delimitados como dados) | 2 |
| 7 | Guardrails de saída (só números do resultado; erros brutos nunca vão ao usuário) | 2 |
| 8 | API (rate limiting, tamanho do corpo, runtime Node.js, cabeçalhos de segurança) | 3 |
| 9 | Observabilidade no LangSmith com metadados de guardrail | 2 |
| 10 | Testes adversariais (validador) e dataset de red team (evals) | 2 / 4 |

## 5. Stack

| Item | Escolha |
|---|---|
| Runtime | Node.js 24 (`.nvmrc` = `24`, `engines.node >= 24`) |
| Framework | Next.js (App Router), TypeScript strict, ESLint, Tailwind CSS, pasta `src/`, alias `@/*` |
| Gerenciador | npm |
| Banco | SQLite em `data/vendas.db` (gitignored) |
| Driver | `better-sqlite3` |
| ORM / migrations | Drizzle ORM + drizzle-kit |
| Dados sintéticos | `@faker-js/faker` (locale `pt_BR`), seed fixa → carga determinística |
| Scripts | `tsx` |
| Env | `zod` + `dotenv` (arquivo real: `.env.local`, carregado também pelos scripts e pelo `drizzle.config.ts`) |
| Testes | `vitest` |
| LLM | `@langchain/langgraph`, `@langchain/core`, `langsmith` (a partir da Etapa 2) |

**Cuidados Next.js + SQLite:**
- `better-sqlite3` em `serverExternalPackages` no `next.config.ts` (módulo nativo).
- Uma única conexão reutilizada em desenvolvimento (cache em `globalThis`).
- `PRAGMA journal_mode = WAL` e `PRAGMA foreign_keys = ON` em toda conexão.
- `src/lib/db` é usado pelo Next.js e pelos scripts `tsx`: **não** importar `server-only` nele.
- Todo acesso ao banco e ao LLM roda só no servidor, no runtime Node.js (nunca Edge).

## 6. Convenções do modelo de dados

- Tabelas e colunas em **português, snake_case, singular**.
- PK `id INTEGER PRIMARY KEY AUTOINCREMENT`.
- Datas em `TEXT` ISO `YYYY-MM-DD`.
- Valores monetários em `REAL`, em reais, arredondados para 2 casas.
- Domínios fechados (status, categorias etc.) em `TEXT` maiúsculo com `CHECK`.
- Não armazenar valores deriváveis (ex.: desconto = `valor_tabela - valor_proposta`).

## 7. Comandos (scripts previstos no PRD; existem a partir dos passos 1.1–1.5)

| Comando | Ação |
|---|---|
| `npm run dev` / `build` / `lint` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | vitest (todos os testes em `tests/`) |
| `npx vitest run tests/db.views.test.ts` | um arquivo de teste; use `-t "<nome>"` para um único caso |
| `npm run db:generate` / `db:migrate` | gerar / aplicar migrations do drizzle-kit (`drizzle/`) |
| `npm run db:seed` | limpar e recarregar dados sintéticos (determinístico, `faker.seed(42)`) |
| `npm run db:reset` | ⚠️ apagar `data/vendas.db`, migrar e popular de novo |
| `npm run db:check` | verificar a integridade (sai com código ≠ 0 se houver violação) |
| `npm run db:studio` | Drizzle Studio para SQL manual (depois de editar à mão, rode `db:check`) |

Todos alteram estado (exceto lint/typecheck/test) → seguem o protocolo da seção 1.

## 8. Arquitetura (visão geral)

- **Duas conexões com o mesmo arquivo:** `src/lib/db/client.ts` (escrita: migrations, seed, scripts em `scripts/`) e `src/lib/db/readonly-client.ts` (único acesso do agente em `src/lib/agent`).
- **Camada de views (`src/lib/db/views.ts`, criada por migration):** dimensões `vw_unidade`, `vw_vendedor`, `vw_cliente`, `vw_produto`; fatos `vw_proposta`, `vw_venda`, `vw_meta_vendedor`; analíticas `vw_venda_detalhada`, `vw_proposta_detalhada`, `vw_desempenho_vendedor_mes` (são a primeira escolha do LLM). Os testes `tests/db.views.test.ts` garantem completude (coluna exposta ou em `EXCLUDED_COLUMNS`), ausência de dados pessoais e uso de índices.
- **Modelo:** unidade → vendedor → proposta ← cliente/produto; `venda` existe se e somente se `proposta.status = 'GANHA'` (1:0..1). `proposta.unidade_id` é um snapshot intencional (vendedor pode ser transferido). `meta_vendedor` é mensal (vendedor, ano, mes).
- **Documentação de schema:** `docs/schema.md` descreve só as views (vai para o prompt); as tabelas base ficam no README ou em `docs/tabelas-base.md` (nunca vão ao LLM).
- **Roadmap:** 1 fundação/dados → 2 grafo LangGraph + LangSmith → 3 Route Handlers + testes de integração → 4 evals/guardrails → 5 frontend (só depois de validar o backend).
- **Repositório git:** ainda não existe; o commit do passo 1.0 sai junto com o do passo 1.1.
