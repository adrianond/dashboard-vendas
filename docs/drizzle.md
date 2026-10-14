# Drizzle no projeto

> Documento para desenvolvedores. Ele descreve as **tabelas base** e, por isso, **nunca vai
> para o prompt do LLM**: o LLM só recebe `docs/schema.md`, que descreve apenas as views `vw_*`
> (CLAUDE.md, seção 4).

## 1. O que é o Drizzle

O Drizzle chega ao projeto como dois pacotes:

| Pacote | Papel |
|---|---|
| `drizzle-orm` | ORM leve: as tabelas são definidas em TypeScript, e as consultas e inserções são feitas com tipos. |
| `drizzle-kit` | Ferramenta de linha de comando: gera migrations a partir do schema, aplica no banco e abre o Drizzle Studio. |

**Por que não escrever só SQL?** Com SQL em texto, um nome de coluna errado, um tipo trocado ou
um campo obrigatório esquecido só aparecem quando o código roda. Com o Drizzle, o TypeScript
acusa esses erros no editor e no `npm run typecheck`:

```ts
// SQL em texto: o erro de digitação ("valor_propsta") só aparece em tempo de execução
sqlite.prepare("INSERT INTO proposta (valor_propsta) VALUES (?)").run(95000);

// Drizzle: o TypeScript recusa a coluna inexistente e avisa sobre campos obrigatórios
db.insert(proposta).values({ valor_propsta: 95000 }); // ❌ erro de tipo
```

## 2. Para que ele é usado nesta aplicação

### Mapa dos arquivos

| Arquivo / pasta | O que é |
|---|---|
| `src/lib/db/schema.ts` | **Fonte da verdade** do banco: as 7 tabelas, com colunas, NOT NULL, UNIQUE, CHECKs, FKs e índices. |
| `drizzle.config.ts` | Configuração do drizzle-kit: dialeto SQLite, onde está o schema, pasta de saída e caminho do banco (`DATABASE_PATH`, lido do `.env.local` via `src/lib/env.ts`). |
| `drizzle/0000_tabelas.sql` | Migration **gerada** a partir do `schema.ts` (as tabelas). |
| `drizzle/0001_views.sql` | Migration **customizada**, escrita à mão: as 10 views do LLM. |
| `drizzle/meta/` | Controle interno do drizzle-kit (snapshots do schema e o `_journal.json`, que lista a ordem das migrations). Não editar à mão. |
| `src/lib/db/client.ts` | Cria a instância `db` do Drizzle sobre o better-sqlite3 (conexão **com escrita**, WAL, chaves estrangeiras). |
| `src/lib/db/seed/` | Geradores de dados sintéticos; o `index.ts` usa o `db` para inserir em transação. |

### Onde o Drizzle **não** entra

- **Agente (Etapa 2):** usa `src/lib/db/readonly-client.ts`, que devolve o **better-sqlite3
  cru**, sem Drizzle. O agente executa SQL gerado pelo LLM (texto), e o validador precisa do
  objeto do better-sqlite3 para conferir `statement.readonly` antes de executar.
- **Views:** o Drizzle não gera views a partir do schema. Elas são escritas em SQL numa
  migration customizada (`drizzle/0001_views.sql`).

```
                schema.ts ──db:generate──► drizzle/*.sql ──db:migrate──► data/vendas.db
                                                                           ▲        ▲
   seed / scripts / testes ── client.ts (Drizzle, com escrita) ────────────┘        │
   agente (Etapa 2) ───────── readonly-client.ts (better-sqlite3 cru, só leitura) ──┘
```

## 3. Como usar

### Comandos

| Comando | O que faz | Quando usar |
|---|---|---|
| `npm run db:generate` | Compara o `schema.ts` com o último snapshot e gera um `.sql` novo em `drizzle/` | Depois de mudar o `schema.ts` |
| `npm run db:migrate` | Aplica no banco as migrations ainda não aplicadas (registra o controle na tabela `__drizzle_migrations`) | Depois de gerar uma migration, ou num clone novo |
| `npm run db:seed` | Apaga e recarrega os dados sintéticos (determinístico, semente 42) | Para ter dados de teste |
| `npm run db:studio` | Abre o Drizzle Studio | Para navegar no banco e rodar SQL manual |

Todos alteram estado (exceto o Studio, enquanto você só lê) e seguem o protocolo do `CLAUDE.md`.

### Passo a passo para mudar o banco (ex.: nova coluna)

1. Edite `src/lib/db/schema.ts`.
2. Gere a migration: `npm run db:generate -- --name <descricao-curta>`.
3. **Revise o SQL gerado** em `drizzle/NNNN_<descricao>.sql` antes de aplicar.
4. Aplique: `npm run db:migrate`.
5. **Decisão de segurança obrigatória:** a coluna nova vai para alguma view (`drizzle/` com uma
   migration customizada que recria a view) **ou** para `EXCLUDED_COLUMNS` em
   `src/lib/db/views.ts`, com o motivo. O teste de completude (passo 1.5) falha se você não decidir.
6. Se necessário, atualize o seed (`src/lib/db/seed/`) e a documentação (`docs/schema.md` se
   a coluna aparecer numa view).

### Migration só de SQL (ex.: views)

```bash
npm run db:generate -- --custom --name <nome>
```

O drizzle-kit cria um `.sql` vazio, registrado no `_journal.json`. Escreva o SQL nele e
separe cada instrução com a linha:

```sql
--> statement-breakpoint
```

Sem esse separador, o migrator executaria só a primeira instrução do arquivo.

### Exemplos de código (conexão com escrita, `client.ts`)

Com o better-sqlite3 as chamadas são **síncronas**: `.all()` devolve uma lista, `.get()` uma
linha e `.run()` executa sem devolver linhas.

```ts
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { produto, vendedor } from "@/lib/db/schema";

// SELECT com filtro
const ativos = db.select().from(vendedor).where(eq(vendedor.ativo, 1)).all();

// SELECT com colunas escolhidas e condição composta
const suvsCaros = db
  .select({ descricao: produto.descricao, preco: produto.preco_tabela })
  .from(produto)
  .where(and(eq(produto.categoria, "SUV"), gte(produto.preco_tabela, 200000)))
  .all();

// INSERT
db.insert(produto).values({
  marca: "Fiat", modelo: "Mobi", versao: "Trekking 1.0", descricao: "Fiat Mobi Trekking 1.0",
  tipo_veiculo: "LEVE", categoria: "HATCH", combustivel: "FLEX",
  ano_modelo: 2025, preco_tabela: 82990, ativo: 1,
}).run();

// Transação (como no seed): ou tudo é gravado, ou nada
db.transaction((tx) => {
  tx.delete(vendedor).run();
  tx.insert(vendedor).values([/* ... */]).run();
});
```

Lembrete: esses exemplos usam a conexão **com escrita**. Código do agente nunca importa
`client.ts` (CLAUDE.md, seção 4).

### Drizzle Studio

```bash
npm run db:studio
```

Abra **https://local.drizzle.studio**. O comando sobe um servidor na sua máquina
(`127.0.0.1:4983`) que abre o `data/vendas.db`; a interface é baixada da internet, mas as
consultas e os resultados trafegam só entre o navegador e esse servidor local. A página só
funciona enquanto o comando estiver rodando (Ctrl+C para encerrar). Mais detalhes e
alternativas offline estão no README, em "Interface do banco".

## 4. Cuidados

- **Nunca edite uma migration já aplicada ou commitada.** O drizzle-kit não reaplica arquivos
  alterados; quem já rodou a versão antiga ficaria com um banco diferente. Crie uma migration nova.
- **Não use `drizzle-kit push`.** Ele altera o banco direto a partir do schema, sem gerar
  migration versionada; o histórico em `drizzle/` deixaria de representar o banco.
- **Não edite `drizzle/meta/` à mão.** Os snapshots são a base de comparação do `db:generate`.
- **O Studio usa a conexão com escrita.** Alterações manuais podem violar regras de integridade;
  depois de editar dados, rode `npm run db:check` (a partir do passo 1.5) ou recrie tudo com
  `npm run db:reset` (a partir do passo 1.4).
- **Views e segurança:** toda view lê direto das tabelas base (nunca de outra view), lista as
  colunas explicitamente (sem `SELECT *`) e não tem triggers.
