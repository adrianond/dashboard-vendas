# Análise 01 — Tabelas e entidades: onde são definidas e como são criadas

> Documento para desenvolvedores (descreve as tabelas base; **nunca vai ao prompt do LLM**).
> O conteúdo de cada tabela (colunas e regras) está em [`tabelas-base.md`](../tabelas-base.md), e
> o uso do Drizzle no dia a dia em [`drizzle.md`](../drizzle.md). Aqui o foco é **qual arquivo é
> responsável por quê** e **quais scripts criam o banco**.

**Resumo.** O projeto não tem classes de entidade. As 7 tabelas são declaradas como **objetos do
Drizzle** (`sqliteTable`) num único módulo TypeScript, o `schema.ts`. O SQL que cria as tabelas no
banco é uma **migration gerada** a partir desse arquivo. As 10 views do LLM não têm declaração em
TypeScript: são **SQL escrito à mão** numa segunda migration. As "entidades" usadas no código são
**tipos TypeScript**, alguns inferidos das tabelas, outros declarados à parte.

---

## 1. Responsabilidade de cada arquivo

| Arquivo | Responsabilidade | Papel |
|---|---|---|
| [`src/lib/db/schema.ts`](../../src/lib/db/schema.ts) | **Declara as entidades** (as 7 tabelas): colunas, tipos, NOT NULL, UNIQUE, CHECK, FKs e índices. É a fonte da verdade do banco. | Declaração (TypeScript, Drizzle) |
| [`drizzle/0000_tabelas.sql`](../../drizzle/0000_tabelas.sql) | **Cria as tabelas no banco** (`CREATE TABLE` e `CREATE INDEX`). Gerado automaticamente a partir do `schema.ts`; não se escreve à mão. | Migration (gerada) |
| [`drizzle/0001_views.sql`](../../drizzle/0001_views.sql) | **Declara e cria as 10 views** (`CREATE VIEW`). Escrito à mão, porque o Drizzle não gera views. | Migration (customizada) |
| [`src/lib/db/views.ts`](../../src/lib/db/views.ts) | **Não cria nada.** Lista as views que o LLM pode consultar (`ALLOWED_VIEWS`) e as colunas que ficam fora das views, com o motivo (`EXCLUDED_COLUMNS`). | Regra de segurança |
| [`drizzle/meta/_journal.json`](../../drizzle/meta/_journal.json) e `drizzle/meta/*_snapshot.json` | **Controlam a ordem e o estado** das migrations: o journal lista quais existem e em que ordem; os snapshots guardam o schema de cada versão (base de comparação do `db:generate`). Mantidos pelo drizzle-kit; não se editam. | Controle de migrations |
| [`drizzle.config.ts`](../../drizzle.config.ts) | **Configura o drizzle-kit:** dialeto SQLite, onde está o schema (`./src/lib/db/schema.ts`), onde gravar as migrations (`./drizzle`) e qual banco usar (`DATABASE_PATH`). | Configuração |
| [`src/lib/db/client.ts`](../../src/lib/db/client.ts) | **Abre a conexão com escrita** (Drizzle sobre better-sqlite3, WAL e FKs ligadas), usada pelo seed, scripts e testes. Não declara tabelas. | Conexão |
| [`src/lib/db/readonly-client.ts`](../../src/lib/db/readonly-client.ts) | **Abre a conexão somente leitura** (better-sqlite3 cru, `readonly` + `query_only`), única usada pelo agente. Não declara tabelas. | Conexão |
| [`src/lib/db/seed/`](../../src/lib/db/seed/) | **Popula as tabelas** com dados sintéticos: um gerador por tabela e o `index.ts`, que limpa e insere tudo numa transação. | Carga de dados |
| [`src/lib/db/check.ts`](../../src/lib/db/check.ts) | **Verifica as regras entre tabelas** que as constraints não garantem (ex.: venda ⇔ proposta `GANHA`). | Verificação |
| [`scripts/reset.ts`](../../scripts/reset.ts), [`scripts/seed.ts`](../../scripts/seed.ts), [`scripts/check.ts`](../../scripts/check.ts) | **Pontos de entrada** dos comandos `db:reset`, `db:seed` e `db:check` (seção 2). | Scripts |

---

## 2. Como o processo ocorre: scripts e comandos

Criar o banco acontece em **três momentos diferentes**, cada um com o seu arquivo ou comando:

1. **Declarar** as entidades: editar o `schema.ts` (à mão).
2. **Gerar** a migration: `npm run db:generate` transforma o `schema.ts` em SQL (só cria arquivos).
3. **Aplicar** a migration: `npm run db:migrate` executa o SQL no `data/vendas.db` (é aqui que as
   tabelas passam a existir).

```
schema.ts                               ← escrito à mão (nenhum script cria as entidades)
    │
    ▼  npm run db:generate  (drizzle-kit generate)          → só cria arquivos em drizzle/
drizzle/0000_tabelas.sql  (gerado)
drizzle/0001_views.sql    (criado vazio com --custom e escrito à mão)
    │
    ▼  npm run db:migrate   (drizzle-kit migrate)           → cria tabelas e views no banco
data/vendas.db            (registro das migrations aplicadas em __drizzle_migrations)
    │
    ▼  npm run db:seed      (tsx scripts/seed.ts)           → insere os dados sintéticos
    ▼  npm run db:check     (tsx scripts/check.ts)          → confere as regras entre tabelas

npm run db:reset = tsx scripts/reset.ts (apaga o banco) → npm run db:migrate → npm run db:seed
```

### Comandos (definidos em `package.json`)

| Comando | Executa | Lê | Produz / altera |
|---|---|---|---|
| `npm run db:generate` | `drizzle-kit generate` | `drizzle.config.ts`, `schema.ts`, último snapshot em `drizzle/meta/` | Um novo `drizzle/NNNN_<nome>.sql`, um novo snapshot e a entrada no `_journal.json`. **Não toca no banco.** |
| `npm run db:migrate` | `drizzle-kit migrate` | `drizzle.config.ts`, `_journal.json`, os `.sql` em `drizzle/` | Executa no `data/vendas.db` as migrations ainda não aplicadas, na ordem do journal, e registra cada uma na tabela interna `__drizzle_migrations`. |
| `npm run db:seed` | `tsx scripts/seed.ts` → `executarSeed()` em `src/lib/db/seed/index.ts` | `schema.ts` (objetos das tabelas), geradores do seed | Apaga os dados das 7 tabelas, zera os IDs e insere tudo de novo numa transação (semente fixa 42: o resultado é sempre o mesmo). |
| `npm run db:reset` | `tsx scripts/reset.ts && npm run db:migrate && npm run db:seed` | `DATABASE_PATH` | ⚠️ Apaga `vendas.db`, `-wal` e `-shm`; recria tabelas e views; popula. É o comando de um clone novo. |
| `npm run db:check` | `tsx scripts/check.ts` | `src/lib/db/check.ts`, conexão somente leitura | Só lê: imprime as regras violadas e sai com código ≠ 0 se houver violação. |
| `npm run db:studio` | `drizzle-kit studio` | `drizzle.config.ts` | Abre o Drizzle Studio (conexão com escrita) para consultas manuais. |

### Como as duas migrations deste projeto foram criadas

Ambas entraram no commit `bef0c74 feat(db): schema e migrations iniciais`.

| Migration | Comando que a criou | Conteúdo |
|---|---|---|
| `drizzle/0000_tabelas.sql` | `npm run db:generate` com `--name tabelas` (o nome do arquivo vem dessa opção; sem ela, o drizzle-kit sorteia um nome) | Gerado a partir do `schema.ts`: 7 `CREATE TABLE` e os índices (`CREATE INDEX` / `CREATE UNIQUE INDEX`). |
| `drizzle/0001_views.sql` | `npm run db:generate -- --custom --name views` (cria o arquivo vazio e o registra no journal) | Escrito à mão: os 10 `CREATE VIEW`, separados por `--> statement-breakpoint` (sem o separador, o migrator executaria só a primeira instrução). |

Para mudar o banco no futuro, o passo a passo (incluindo a decisão de segurança sobre colunas novas)
está em [`drizzle.md`](../drizzle.md), seção 3.

---

## 3. Detalhe por tabela

Linhas conforme o código atual. "Views" lista as views que leem a tabela; "Seed" é a função que gera
as linhas (em `src/lib/db/seed/`).

| Tabela | Declaração (`schema.ts`) | Criação (`0000_tabelas.sql`) | FKs | Views | Seed |
|---|---|---|---|---|---|
| `unidade` | `export const unidade`, linha 8 | linha 89 | — | `vw_unidade`, `vw_venda_detalhada`, `vw_proposta_detalhada`, `vw_desempenho_vendedor_mes` | `gerarUnidades()` (`unidades.ts`) |
| `vendedor` | `export const vendedor`, linha 33 | linha 126 | `unidade_id` → `unidade` | `vw_vendedor`, `vw_venda_detalhada`, `vw_proposta_detalhada`, `vw_desempenho_vendedor_mes` | `gerarVendedores()` (`vendedores.ts`) |
| `cliente` | `export const cliente`, linha 52 | linha 1 | — | `vw_cliente`, `vw_venda_detalhada`, `vw_proposta_detalhada` | `gerarClientes()` (`clientes.ts`) |
| `produto` | `export const produto`, linha 72 | linha 31 | — | `vw_produto`, `vw_venda_detalhada`, `vw_proposta_detalhada` | `gerarProdutos()` (`catalogo.ts`) |
| `proposta` | `export const proposta`, linha 102 | linha 53 | `unidade_id`, `vendedor_id`, `cliente_id`, `produto_id` | `vw_proposta`, `vw_venda_detalhada`, `vw_proposta_detalhada`, `vw_desempenho_vendedor_mes` | `gerarPropostas()` (`propostas.ts`) |
| `venda` | `export const venda`, linha 144 | linha 111 | `proposta_id` → `proposta` (única) | `vw_venda`, `vw_venda_detalhada`, `vw_proposta_detalhada`, `vw_desempenho_vendedor_mes` | `gerarVendas()` (`propostas.ts`) |
| `meta_vendedor` | `export const meta_vendedor`, linha 161 | linha 17 | `vendedor_id` → `vendedor` | `vw_meta_vendedor`, `vw_desempenho_vendedor_mes` | `gerarMetas()` (`metas.ts`) |

No SQL gerado, as tabelas aparecem em ordem alfabética (é a ordem do drizzle-kit, não a do
`schema.ts`). As constraints declaradas no `schema.ts` viram, no SQL:

| No `schema.ts` | No `0000_tabelas.sql` | Exemplo |
|---|---|---|
| `check("nome", sql\`...\`)` | `CONSTRAINT "nome" CHECK(...)` dentro do `CREATE TABLE` | `proposta_status_ck` |
| `.unique()` numa coluna | `CREATE UNIQUE INDEX <tabela>_<coluna>_unique` | `vendedor_cpf_unique` |
| `unique("nome").on(...)` | `CREATE UNIQUE INDEX nome` | `meta_vendedor_vendedor_ano_mes_uq` |
| `index("nome").on(...)` | `CREATE INDEX nome` | `proposta_data_proposta_idx` |
| `.references(() => x.id)` | `FOREIGN KEY ... REFERENCES x(id)` | `vendedor.unidade_id` |

**Ordem de carga do seed** (`executarSeed()`, numa única transação): limpa as tabelas filhas antes
das mães (`venda`, `proposta`, `meta_vendedor`, `vendedor`, `cliente`, `produto`, `unidade`), zera
`sqlite_sequence` e insere `unidade` → `produto` → `vendedor` → `cliente` → `proposta` → `venda` →
`meta_vendedor`.

---

## 4. Views

Declaradas e criadas no mesmo arquivo, [`drizzle/0001_views.sql`](../../drizzle/0001_views.sql).
Toda view lê **direto das tabelas base** (nunca de outra view), lista as colunas explicitamente e
não tem triggers. A lista de nomes permitidos ao LLM fica em `ALLOWED_VIEWS` (`views.ts`), e a
descrição que vai ao prompt fica em [`schema.md`](../schema.md).

| View | Linha | Grupo | Lê |
|---|---|---|---|
| `vw_unidade` | 4 | Dimensão | `unidade` |
| `vw_vendedor` | 8 | Dimensão | `vendedor` |
| `vw_cliente` | 12 | Dimensão | `cliente` (sem nome de PF; `razao_social` e `faixa_etaria` derivadas) |
| `vw_produto` | 32 | Dimensão | `produto` |
| `vw_proposta` | 38 | Fato | `proposta` (sem `observacao`) |
| `vw_venda` | 43 | Fato | `venda` (sem `numero_nota_fiscal`) |
| `vw_meta_vendedor` | 47 | Fato | `meta_vendedor` |
| `vw_venda_detalhada` | 53 | Analítica | `venda` + `proposta` + `unidade` + `vendedor` + `produto` + `cliente` |
| `vw_proposta_detalhada` | 99 | Analítica | `proposta` + `venda` (LEFT JOIN) + `unidade` + `vendedor` + `produto` + `cliente` |
| `vw_desempenho_vendedor_mes` | 149 | Analítica | `meta_vendedor` + `vendedor` + `unidade` + `venda`/`proposta` (LEFT JOIN, vendas do vendedor no mês) |

---

## 5. Entidades no TypeScript

Não há classes. O código usa quatro tipos de "entidade":

**a) Os objetos das tabelas** (`schema.ts`). Cada `export const <tabela> = sqliteTable(...)` é ao
mesmo tempo a declaração da tabela e o objeto usado nas consultas do Drizzle
(`db.insert(produto)`, `tx.delete(venda)`).

**b) Tipos inferidos das tabelas.** O Drizzle deriva o tipo de uma linha do próprio objeto, sem
declaração separada. O projeto usa só `typeof <tabela>.$inferInsert` (formato de inserção), e só no
seed:

| Arquivo | Tipo usado |
|---|---|
| `seed/unidades.ts` | `typeof unidade.$inferInsert` |
| `seed/vendedores.ts` | `typeof vendedor.$inferInsert` |
| `seed/clientes.ts` | `typeof cliente.$inferInsert` |
| `seed/catalogo.ts` | `typeof produto.$inferInsert` |
| `seed/propostas.ts` | `typeof proposta.$inferInsert` (em `PropostaGerada`) e `typeof venda.$inferInsert` |
| `seed/metas.ts` | `typeof meta_vendedor.$inferInsert` |

**c) Tipos declarados à parte, sem vínculo com o `schema.ts`.**

| Arquivo | Tipos | Observação |
|---|---|---|
| `seed/unidades.ts` | `Regiao` | Repete o domínio do CHECK `unidade_regiao_ck` |
| `seed/catalogo.ts` | `TipoVeiculo`, `Categoria`, `Combustivel`, `ItemCatalogo` | Repetem os domínios dos CHECKs de `produto` |
| `seed/propostas.ts` | `UnidadeSeed`, `VendedorSeed`, `ClienteSeed`, `ProdutoSeed`, `DadosVenda` | Recortes das linhas usados entre os geradores |
| `src/lib/db/check.ts` | `Regra`, `ResultadoRegra` | Estrutura das regras de integridade |
| `src/lib/db/views.ts` | `AllowedView` | União dos nomes em `ALLOWED_VIEWS` |

**d) Entidades do agente, que não são tabelas.** Representam o que o agente manipula, não o banco:

| Arquivo | Tipos |
|---|---|
| `src/lib/agent/state.ts` | `EstadoAgente`, `ResultadoAgente` (contrato da API da Etapa 3), `Troca` (item do histórico), `RegistroGuardrail`, `Categoria`, `Status` |
| `src/lib/agent/sql/executor.ts` | `Linha`, `ResultadoSql`, `ResultadoExecucao` (resultado de uma consulta às views) |

Há ainda uma **lista paralela dos nomes das tabelas**: `TABELAS_BASE` em
[`src/lib/agent/saida.ts`](../../src/lib/agent/saida.ts), usada pelo guardrail de saída para barrar
nomes de tabela na resposta. Ela é fixa de propósito (o agente não importa o schema das tabelas), e
um teste em `tests/agent.graph.test.ts` confere que ela acompanha o `schema.ts`.

---

## 6. Onde a estrutura é verificada

| Verificação | Arquivo | O que garante |
|---|---|---|
| Constraints do banco | `0000_tabelas.sql` (gerado do `schema.ts`) | NOT NULL, UNIQUE, CHECK e FKs a cada inserção |
| Regras entre tabelas | `src/lib/db/check.ts` (via `db:check` e `tests/db.integrity.test.ts`) | venda ⇔ proposta `GANHA`, datas coerentes, unidade da proposta = unidade do vendedor etc. |
| Conexão com escrita | `tests/db.client.test.ts` | Contagens pelo Drizzle, volumes esperados, WAL e FKs ligadas |
| Conexão somente leitura | `tests/db.readonly.test.ts` | `readonly` + `query_only`, ATTACH inerte, banco intacto |
| Views | `tests/db.views.test.ts` | Views = `ALLOWED_VIEWS`; toda coluna exposta ou em `EXCLUDED_COLUMNS`; sem dados pessoais; consistência com as tabelas; uso de índices; nenhuma trigger |
| Lista paralela do agente | `tests/agent.graph.test.ts` | `TABELAS_BASE` igual às tabelas do `schema.ts` |

---

## 7. Observações da análise

1. **Domínios fechados declarados em três lugares.** Os valores de região, tipo de veículo,
   categoria e combustível estão nos CHECKs do `schema.ts`, em tipos do seed (`Regiao`,
   `TipoVeiculo`, `Categoria`, `Combustivel`) e no texto das views/`schema.md`. Nenhum teste
   compara essas listas: se uma mudar e as outras não, o seed pode gerar valores que o banco
   recusa (o erro aparece só no `db:seed`) ou o `schema.md` pode descrever valores que não existem.
   *Sugestão:* declarar cada domínio uma vez (ex.: `export const REGIOES = [...] as const` num
   módulo de domínio) e usar essa constante no CHECK, no tipo do seed e num teste que compare com o
   `schema.md`.
2. **`$inferSelect` nunca é usado.** O código que lê o banco (agente, `check.ts`, testes) usa SQL
   em texto pelo better-sqlite3 e trata as linhas como `Record<string, unknown>`. É coerente com a
   arquitetura (o agente não usa Drizzle), mas significa que as leituras não têm tipo das colunas.
   A camada de indicadores da Etapa 3 é um bom lugar para tipar os retornos.
3. **As views não têm representação em TypeScript.** Só os nomes (`ALLOWED_VIEWS`) existem no
   código; as colunas de cada view estão apenas no SQL e no `schema.md`. A coerência entre os dois é
   garantida pelos testes de completude e consistência, não pelo compilador.
4. **Um segundo banco virá na Etapa 3.** O `data/checkpoints.db` (conversas do agente) será criado
   pelo próprio checkpointer do LangGraph, fora do Drizzle e sem migration deste projeto. Ainda não
   existe.
