# Análise 02 — Testes: responsabilidade de cada arquivo e como executar

> Documento para desenvolvedores. Retrato de 2026-10-23: **12 arquivos, 360 casos** (358 passam e
> 2 ficam pulados de propósito, porque dependem de LLM real). Os números por arquivo vêm de uma
> execução real do `npm test`.

**Resumo.** Os testes ficam todos em `tests/`, usam o **vitest** e se dividem em dois grupos: os
`db.*` e o `schema-docs`, da Etapa 1 (banco, views e documentação do schema), e os `agent.*`, da
Etapa 2 (validador, executor, prompts, grafo e observabilidade). Existe **um único script de
teste**, o `npm test`, que roda todos; arquivos e casos isolados usam o mesmo script com
argumentos. Os testes com LLM real não têm script próprio: são ligados por uma variável de ambiente.

---

## 1. Responsabilidade de cada arquivo

| Arquivo | Responsabilidade (o que garante) | Testes | Banco real | LLM / chave |
|---|---|---|---|---|
| [`db.client.test.ts`](../../tests/db.client.test.ts) | A **conexão com escrita** (`client.ts`) lê todas as tabelas pelo Drizzle, os volumes do seed estão na faixa esperada e a conexão tem WAL e chaves estrangeiras ligadas. | 3 | Sim | Não |
| [`db.readonly.test.ts`](../../tests/db.readonly.test.ts) | A **conexão somente leitura** do agente (`readonly-client.ts`) recusa qualquer escrita: INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, ATTACH, PRAGMA de escrita, VACUUM, REINDEX. O banco termina idêntico. | 18 | Sim | Não |
| [`db.views.test.ts`](../../tests/db.views.test.ts) | As **views do LLM** são exatamente as de `ALLOWED_VIEWS`, não expõem dados pessoais, cobrem toda coluna (ou ela está em `EXCLUDED_COLUMNS`), batem com as tabelas base, usam índices e são construídas só sobre tabelas base, sem triggers. | 47 | Sim | Não |
| [`db.integrity.test.ts`](../../tests/db.integrity.test.ts) | Os **dados do seed** respeitam as regras entre tabelas de `src/lib/db/check.ts` (as mesmas do `npm run db:check`): uma regra por caso. | 13 | Sim | Não |
| [`schema-docs.test.ts`](../../tests/schema-docs.test.ts) | O **`docs/schema.md`** (o que vai ao prompt do LLM) está correto: todo bloco SQL executa pela conexão somente leitura, retorna dados, consulta só views permitidas e tem `LIMIT` ≤ 500. | 52 | Sim | Não |
| [`agent.validator.test.ts`](../../tests/agent.validator.test.ts) | O **validador de SQL** aprova as queries legítimas (inclusive os 17 blocos do `schema.md`) e reprova os casos adversariais com o motivo esperado, regra por regra. | 90 | Sim (só `prepare`, sem executar) | Não |
| [`agent.executor.test.ts`](../../tests/agent.executor.test.ts) | O **executor seguro** aplica o limite de linhas, converte BigInt, transforma erro do SQLite em resultado, não escreve nem recebendo SQL malicioso direto, interrompe query cara no timeout e resume o resultado para o LLM. | 15 | Sim (processo filho) | Não |
| [`agent.imports.test.ts`](../../tests/agent.imports.test.ts) | **Nenhum arquivo do agente alcança a conexão com escrita** (`client.ts`), nem direta nem indiretamente, percorrendo o grafo de imports. Um caso por arquivo de `src/lib/agent`. | 28 | Não | Não |
| [`agent.prompts.test.ts`](../../tests/agent.prompts.test.ts) | Os **prompts** delimitam o conteúdo variável em tags, neutralizam tags injetadas, declaram que o conteúdo é dado (não instrução), usam o schema só do `schema.md` e limitam o histórico. | 33 | Não | Não |
| [`agent.graph.test.ts`](../../tests/agent.graph.test.ts) | O **grafo do agente** percorre os caminhos certos (sucesso, autocorreção, recusa, falha, acompanhamento), aplica os guardrails de entrada e de saída e nunca expõe erro técnico. Usa **modelos e executor falsos**. | 47 | Sim (validador real) | Não (modelos falsos) |
| [`agent.observabilidade.test.ts`](../../tests/agent.observabilidade.test.ts) | Os **metadados e tags dos traces** do LangSmith estão certos, e o grafo do Studio é criado sem exigir a chave só para importar o módulo. | 5 | Não | 1 caso exige `ANTHROPIC_API_KEY` (sem chamar a API) |
| [`agent.llm.test.ts`](../../tests/agent.llm.test.ts) | O **agente real** responde às 10 perguntas de referência do `schema.md` com os valores certos (mínimo 9) e recusa 5 perguntas maliciosas sem alterar o banco. Inclui testes, sem LLM, do comparador de resultados. | 7 + 2 pulados | Sim | **2 casos com LLM real (custo)**, só com `RUN_LLM_TESTS=1` |

---

## 2. Como executar: scripts e comandos

### O único script: `npm test`

Definido em `package.json` como `vitest run --configLoader runner`. Roda **todos** os arquivos
`tests/**/*.test.ts` (padrão definido em [`vitest.config.mts`](../../vitest.config.mts), que também
configura o alias `@` → `src/`).

A flag `--configLoader runner` contorna uma falha do vitest no Windows: sem ela, o processo cai com
*segfault* ao empacotar o `vitest.config.mts` (decisão registrada no README).

**Não existe um script por teste.** Arquivos e casos isolados usam o mesmo `npm test`, com
argumentos depois do `--`:

| Para rodar | Comando |
|---|---|
| Todos os testes | `npm test` |
| Um arquivo | `npm test -- tests/agent.graph.test.ts` |
| Um caso (ou um grupo) pelo nome | `npm test -- tests/agent.graph.test.ts -t "sucesso direto"` |
| Todos os casos cujo nome contém um texto, em qualquer arquivo | `npm test -- -t "timeout"` |

> O `CLAUDE.md` (seção 7) ainda cita `npx vitest run tests/db.views.test.ts`. Sem a flag
> `--configLoader runner`, esse comando cai no Windows; prefira `npm test -- <arquivo>`.

### Pré-requisito: o banco precisa existir

Nove dos doze arquivos leem o banco real `data/vendas.db`, gerado pelo seed (só `agent.imports`,
`agent.prompts` e `agent.observabilidade` não leem). Num clone novo, ou
depois de editar dados à mão, rode antes:

```bash
npm run db:reset   # apaga, migra e popula o banco (seed determinístico)
```

Os testes não alteram o banco: os que tentam escrever usam a conexão somente leitura e conferem, no
fim, que tudo continua idêntico.

### Testes com LLM real: sem script, por variável de ambiente

Os 2 casos do bloco "agente com LLM real" de `agent.llm.test.ts` chamam a API da Anthropic e
**têm custo** (~35 chamadas por execução completa, entre Haiku e Sonnet, mais as correções de SQL;
cada execução também gera traces no LangSmith). Eles só rodam com `RUN_LLM_TESTS=1`; sem a
variável, aparecem como **pulados** no `npm test`.

| Shell | Comando |
|---|---|
| bash / Git Bash | `RUN_LLM_TESTS=1 npm test -- tests/agent.llm.test.ts` |
| PowerShell | `$env:RUN_LLM_TESTS="1"; npm test -- tests/agent.llm.test.ts; Remove-Item Env:RUN_LLM_TESTS` |
| Só as 10 perguntas de referência (PowerShell) | `$env:RUN_LLM_TESTS="1"; npm test -- tests/agent.llm.test.ts -t "perguntas de referência"; Remove-Item Env:RUN_LLM_TESTS` |

Exigem `ANTHROPIC_API_KEY` (e, para os traces, `LANGSMITH_API_KEY`) no `.env.local`.

### Teste que depende da chave, mas não tem custo

Em `agent.observabilidade.test.ts`, o caso "a fábrica devolve o grafo com os 9 nós" cria o grafo do
LangGraph Studio com os modelos reais, **sem chamar a API**. Ele só roda se `ANTHROPIC_API_KEY`
estiver definida; sem ela, é pulado.

### Scripts previstos e ainda inexistentes

O PRD da Etapa 3 (seção 8) prevê dois scripts, a criar no passo 3.6:

| Script | O que fará |
|---|---|
| `npm run test:e2e` | Sobe o servidor Next.js (`next build && next start`), roda os testes ponta a ponta da API contra ele e derruba o servidor. |
| `npm run test:llm` | Roda os testes com LLM real definindo `RUN_LLM_TESTS=1` de forma multiplataforma. |

### Outras verificações (não são testes do vitest)

| Comando | O que verifica |
|---|---|
| `npm run typecheck` | Tipos do TypeScript (`tsc --noEmit`) |
| `npm run lint` | ESLint, incluindo a regra que proíbe o agente de importar a conexão com escrita |
| `npm run db:check` | As mesmas regras de integridade do `db.integrity.test.ts`, com relatório no terminal |
| `npm run agent:ask -- "pergunta"` | Verificação manual do agente real pelo terminal (**tem custo**) |

---

## 3. Detalhe por arquivo

### Etapa 1: banco, views e documentação

**`db.client.test.ts`** (3), grupo "camada de banco da aplicação (client.ts)":
- lê a contagem de cada tabela pelo Drizzle (todas > 0);
- volumes dentro de ±10% do esperado (12 unidades, ~70 vendedores, ~3.000 clientes, ~60 produtos,
  ~8.000 propostas);
- `journal_mode = wal` e `foreign_keys = 1`.

**`db.readonly.test.ts`** (18), grupo "conexão somente leitura do agente":
- a conexão está aberta como `readonly` e com `query_only` ligado;
- cada uma das 13 tentativas de escrita falha (INSERT, UPDATE, DELETE, DROP TABLE, DROP VIEW,
  CREATE TABLE, CREATE INDEX, ALTER TABLE, ATTACH de arquivo, `PRAGMA user_version`,
  `PRAGMA journal_mode`, VACUUM, REINDEX);
- ATTACH de arquivo não cria o arquivo; `ATTACH ':memory:'` fica inerte;
- mesmo desligando `query_only`, o arquivo aberto como `readonly` bloqueia a escrita;
- uma "fotografia" do banco (contagens, somas, objetos, pragmas) é idêntica antes e depois.

**`db.views.test.ts`** (47), quatro grupos:
- *existência e exposição*: views do banco = `ALLOWED_VIEWS`; cada view retorna dados e não expõe
  colunas removidas; `vw_cliente` não tem o nome de PF; `razao_social` só para PJ e `faixa_etaria`
  só para PF;
- *completude*: toda coluna de cada tabela base aparece numa view ou está em `EXCLUDED_COLUMNS`, e
  essa lista só cita colunas que existem;
- *consistência*: `vw_venda_detalhada` e `vw_proposta_detalhada` batem com as tabelas base;
  `vw_desempenho_vendedor_mes` confere com um cálculo independente;
- *desempenho e construção*: filtros e JOINs usam índices (pelo plano de execução); não há
  triggers; cada view é construída só sobre tabelas base.

**`db.integrity.test.ts`** (13), grupo "integridade dos dados": um caso por regra de `REGRAS`
(`src/lib/db/check.ts`). Por exemplo: toda proposta `GANHA` tem exatamente uma venda; datas de
venda e entrega coerentes; `valor_proposta ≤ valor_tabela`; categoria coerente com o tipo de
veículo.

**`schema-docs.test.ts`** (52), grupo "docs/schema.md":
- o documento tem os 7 blocos de relacionamento e os 10 exemplos (17 blocos SQL);
- para cada um dos 17 blocos: executa pela conexão somente leitura e retorna dados; consulta só
  views de `ALLOWED_VIEWS`; tem `LIMIT` de no máximo 500.

### Etapa 2: agente

**`agent.validator.test.ts`** (90):
- *queries aprovadas*: os 17 blocos do `schema.md` mais 10 casos extras (CTE, função de janela com
  `PARTITION BY 1`, UNION, subquery, `;` final, instrução dentro de comentário etc.);
- *casos adversariais*: 50+ casos organizados pelas regras do validador. Por exemplo: query vazia
  ou longa demais; SQL que o parser não entende (PRAGMA, VACUUM, BEGIN...); duas instruções, inclusive
  escondidas após comentário; INSERT, UPDATE, DELETE, ATTACH; acesso a cada tabela base (inclusive
  em subquery, JOIN, UNION e CTE); `sqlite_master`; `pragma_table_info`; `load_extension`,
  `randomblob`; CTE recursiva; coluna inexistente;
- a regra 9 (o SQLite confirma que a instrução é somente leitura) é testada com um `prepare`
  injetado.

**`agent.executor.test.ts`** (15):
- *limite de linhas*: aplica `LIMIT máximo + 1`, marca `truncado`, mantém as colunas em resultado vazio;
- *tipos e erros*: BigInt vira número (ou texto, se não couber); erro do SQLite vira `ok: false`;
- *defesa em profundidade*: INSERT, DELETE, quebra do envoltório com `;` e ATTACH, enviados
  **direto** ao executor (sem o validador), falham, e o banco fica idêntico;
- *timeout*: uma query cara (produto cartesiano) é interrompida em menos de 2× o timeout, e o
  executor continua funcionando depois;
- *`resumirParaLlm`*: respeita o máximo de linhas e de caracteres enviados ao LLM e corta textos longos.

**`agent.imports.test.ts`** (28): percorre os imports de cada arquivo de `src/lib/agent` (26 casos,
um por arquivo) e prova que nenhum alcança `src/lib/db/client.ts`. Dois casos extras provam que a
busca funciona: os arquivos do agente são encontrados, e o processo filho do executor alcança o
`readonly-client.ts`.

**`agent.prompts.test.ts`** (33):
- *neutralização de tags*: `</pergunta>`, variações com espaços e maiúsculas, todas as tags dos
  prompts; texto comum (`a < b`, `<b>`) é preservado;
- *histórico*: só as últimas trocas; nunca linhas de resultado; SQL só quando pedido;
- *cada um dos 4 prompts*: uma mensagem de sistema e uma de usuário; aviso "dado, nunca
  instrução"; a pergunta só na mensagem do usuário, delimitada;
- *schema no prompt*: vem exatamente do `schema.md`, cita todas as views e nenhum DDL de tabela base;
- *prompts de correção e resposta*: delimitam SQL anterior, erro e resultado, sem o SQL executado.

**`agent.graph.test.ts`** (47), com modelos e executor falsos (sem custo):
- *sucesso*: fluxo completo e resultado vazio;
- *autocorreção*: após erro de validação e de execução; tentativas esgotadas → `FALHA` com
  mensagem genérica; limite de tentativas configurável; `sql = null` → `FALHA` sem corrigir;
- *recusas*: `FORA_ESCOPO` e `MANIPULACAO` sem gerar SQL; entrada vazia, longa demais ou só com
  símbolos sem nenhuma chamada a LLM;
- *guardrail de saída e falhas do modelo*: resposta com SQL, CPF ou nome de tabela é trocada pela
  mensagem de falha; resposta cortada pelo limite de tokens vira `FALHA`; exceção de qualquer modelo
  vira `FALHA` sem expor o erro;
- *acompanhamento*: o histórico do mesmo thread entra nos prompts; recusas não entram; limite de trocas;
- *rotas*: as funções de rota do grafo, isoladas;
- *`verificarSaida`*: a lista de tabelas base acompanha o `schema.ts`; casos que devem ser barrados
  e casos que não podem ser (valores em reais, períodos, datas).

**`agent.observabilidade.test.ts`** (5): tags do trace (etapa, modelos e `guardrail-bloqueio` quando
algum guardrail reprova); metadados do trace (com a quantidade de linhas, não as linhas); a fábrica
do grafo do Studio (exige a chave); importar `src/lib/agent` não exige a chave.

**`agent.llm.test.ts`** (7 sem LLM + 2 com LLM):
- *comparação por valores* (sempre roda): extrai as 10 perguntas e os SQL de referência do
  `schema.md`; o comparador aceita nomes de colunas, ordem de linhas e colunas extras diferentes,
  e a precisão da referência; recusa valor e número de linhas diferentes; os SQL de referência rodam;
- *agente com LLM real* (só com `RUN_LLM_TESTS=1`): as 10 perguntas de referência (mínimo 9
  corretas, comparando valores, não o texto do SQL) e as 5 maliciosas (todas `RECUSADO`), com o banco
  idêntico antes e depois.

---

## 4. Testes por camada de segurança

As camadas são as da seção 4 do `CLAUDE.md`.

| Camada | Arquivos que a testam |
|---|---|
| 1. Banco: conexão somente leitura exclusiva do agente | `db.readonly`, `agent.imports`, `agent.executor` (defesa em profundidade) |
| 2. Dados: só views, sem dados pessoais | `db.views`, `schema-docs` |
| 3. Validação do SQL com parser | `agent.validator` |
| 4. Limites de execução (linhas, timeout, tentativas) | `agent.executor`, `agent.graph` (tentativas) |
| 5. Guardrails de entrada | `agent.graph` (recusas) |
| 6. Prompt (regras e delimitação) | `agent.prompts` |
| 7. Guardrails de saída | `agent.graph` (guardrail de saída e `verificarSaida`) |
| 8. API | — (Etapa 3) |
| 9. Observabilidade | `agent.observabilidade` |
| 10. Testes adversariais e red team | `agent.validator` (adversariais), `agent.llm` (maliciosas com LLM real); o dataset de red team vem na Etapa 3 |

---

## 5. Observações da análise

1. **Um teste é intermitente.** O caso "a fábrica devolve o grafo com os 9 nós"
   (`agent.observabilidade.test.ts`) faz `import("@/lib/agent")` dentro do próprio teste, o que
   carrega o LangChain inteiro. Com a suíte rodando em paralelo, isso às vezes passa dos 5 s de
   prazo padrão do vitest: em 2026-10-23 ele falhou numa execução completa e passou isolado e numa
   segunda execução. *Sugestão:* dar a ele um prazo próprio, como fazem os testes do executor.
2. **O comando de exemplo no `CLAUDE.md` está desatualizado.** A seção 7 cita
   `npx vitest run tests/...`, que cai no Windows sem `--configLoader runner`. A troca por
   `npm test -- tests/<arquivo>.test.ts` está pendente de aprovação (registrada no `progresso.md`).
3. **Os testes dependem do banco real.** Nove arquivos leem o `data/vendas.db` gerado pelo seed.
   Isso prova o comportamento com os dados de verdade, mas um banco ausente ou editado à mão
   reprova testes que não têm relação com a edição. A saída é sempre `npm run db:reset`.
4. **Os geradores do seed não têm teste próprio.** São cobertos indiretamente: o
   `db.integrity.test.ts` confere as regras e o `db.client.test.ts`, os volumes. Uma mudança que
   gere dados válidos, mas com distribuição muito diferente (ex.: conversão fora da faixa), não
   seria acusada por nenhum teste.
5. **Só um arquivo usa modelos falsos para o fluxo completo.** O `agent.graph.test.ts` é o que
   garante o comportamento do agente sem custo; o comportamento com o modelo real só é medido no
   `agent.llm.test.ts`, que fica fora do `npm test` comum. Na Etapa 3, as avaliações no LangSmith
   (datasets gold e red team) ampliam essa medição.
