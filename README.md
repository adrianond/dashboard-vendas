# Dashboard de Vendas de Veículos

Dashboard de vendas para uma rede de concessionárias franqueadas. O usuário faz perguntas em
linguagem natural, e um grafo LangGraph gera, executa e corrige SQL sobre um banco SQLite.
Construído em etapas; a especificação de cada uma está no PRD correspondente
(`PRD-etapa-01-fundacao-e-dados.md`).

## Pré-requisitos

- Node.js 24 (versão em `.nvmrc`)
- npm

## Instalação

```bash
npm install
cp .env.example .env.local   # PowerShell: Copy-Item .env.example .env.local
```

Preencha o `.env.local` (nunca versionado). Obrigatória: `DATABASE_PATH`. Para usar o agente com
o modelo real (CLI, Studio e testes com LLM), preencha também `ANTHROPIC_API_KEY`; sem
`LANGSMITH_API_KEY`, o agente funciona sem rastreamento. As demais variáveis têm padrão (seção 7.4
do PRD da Etapa 2).

## Gerar e verificar o banco

```bash
npm run db:reset   # cria data/vendas.db, aplica as migrations e carrega os dados sintéticos
npm run db:check   # confere as regras de integridade (deve terminar com "Nenhuma violação.")
npm test           # testes de integração, integridade, segurança e documentação
npm run dev        # sobe a aplicação em http://localhost:3000
```

O seed é determinístico: rodar o `db:reset` de novo gera exatamente os mesmos dados.

## Scripts

| Script | Ação |
|---|---|
| `npm run dev` | servidor de desenvolvimento em http://localhost:3000 |
| `npm run build` | build de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | checagem de tipos (`tsc --noEmit`) |
| `npm test` | testes (vitest) |
| `npm run db:generate` | gera migrations a partir de `src/lib/db/schema.ts` (pasta `drizzle/`) |
| `npm run db:migrate` | aplica as migrations em `data/vendas.db` |
| `npm run db:seed` | apaga e recarrega os dados sintéticos (determinístico, semente 42) |
| `npm run db:reset` | ⚠️ apaga `data/vendas.db`, aplica as migrations e roda o seed |
| `npm run db:check` | verifica as regras de integridade (sai com código ≠ 0 se houver violação) |
| `npm run db:studio` | abre o Drizzle Studio (ver abaixo) |

> Feche o Drizzle Studio e o `npm run dev` antes do `db:reset`: no Windows, um programa
> com o banco aberto impede a exclusão do arquivo (erro EPERM/EBUSY).

Os testes (`npm test`) leem o banco real em `data/vendas.db`. Num clone novo, ou depois de
editar dados à mão, rode `npm run db:reset` antes.

## Interface do banco (queries manuais)

**Drizzle Studio** (principal):

```bash
npm run db:studio
```

Depois abra **https://local.drizzle.studio** no navegador. A página é servida pelo site do
Drizzle, mas conversa com um servidor que roda na sua máquina (porta 4983); os dados não saem
do seu computador. Lá dá para navegar nas tabelas e views e executar SQL livre no console.
Para encerrar, use Ctrl+C no terminal.

Como funciona:
- `npm run db:studio` sobe um servidor local (`127.0.0.1:4983`) que abre `data/vendas.db`;
  a página só funciona enquanto ele estiver rodando.
- A interface é baixada da internet (é preciso estar online), mas as consultas e os resultados
  trafegam apenas entre o navegador e o servidor local.
- O Studio usa a conexão normal (com escrita), não a somente leitura do agente.
- Navegadores restritivos (Brave, Safari) podem bloquear o acesso da página ao `localhost`;
  nesse caso, use uma das alternativas abaixo.

Alternativas (sem instalação obrigatória):
- [DB Browser for SQLite](https://sqlitebrowser.org/), aplicativo desktop gratuito e 100% offline;
- extensão de SQLite do VS Code;
- `sqlite3 data/vendas.db` no terminal.

> ⚠️ Alterações manuais nos dados podem violar as regras de integridade. Depois de editar à
> mão, rode `npm run db:check`; para voltar ao estado original, `npm run db:reset`.

Guia completo do Drizzle no projeto: [docs/drizzle.md](docs/drizzle.md).

## Documentação

- [docs/schema.md](docs/schema.md) — views disponíveis para consultas (é o contexto do LLM)
- [docs/tabelas-base.md](docs/tabelas-base.md) — tabelas base (só para desenvolvedores; nunca vai ao LLM)
- [docs/drizzle.md](docs/drizzle.md) — como o Drizzle é usado no projeto
- [docs/progresso.md](docs/progresso.md) — andamento das etapas e pendências

## Segurança

O agente (a partir da Etapa 2) **só lê** o banco:

- **Camada 1 — conexão:** `src/lib/db/readonly-client.ts` abre o arquivo em modo somente leitura
  e com `PRAGMA query_only = ON`; uma regra de lint impede `src/lib/agent` de importar a conexão
  de escrita ou abrir conexões próprias. `tests/db.readonly.test.ts` prova que escrita, alteração
  de estrutura e `PRAGMA`s de escrita falham e que o banco continua idêntico.
- **Camada 2 — dados:** o LLM só conhece as views `vw_*`, sem dados pessoais nem texto livre.
  `tests/db.views.test.ts` prova a ausência das colunas sensíveis, a completude, a consistência
  com as tabelas base e o uso de índices.

As demais camadas (validação do SQL, limites, guardrails etc.) entram nas próximas etapas.
Detalhes no `CLAUDE.md`, seção 4.

## Decisões

- **Projeto gerado numa pasta temporária:** o `create-next-app` não aceita pastas com arquivos
  (`CLAUDE.md`, `.claude/`, PRD). O projeto foi gerado em `_setup-tmp/dashboard-vendas` e movido
  para a raiz, preservando esses arquivos.
- **`AGENTS.md` versionado:** gerado pelo Next.js 16 com instruções para agentes de IA; o
  `next dev` o recria se for apagado.
- **Vulnerabilidades do `npm audit` não corrigidas:** as 5 (alta) vêm de `braces`, dependência
  só do lint (`eslint-config-next`). O `npm audit fix --force` rebaixaria o
  `eslint-config-next` para a 14.x, incompatível com o Next 16. Risco desprezível (ferramenta de
  desenvolvimento, sem entrada externa); resolver com `npm update` quando houver correção.
  As 4 moderadas vêm de um `esbuild` antigo (≤ 0.24.2) embutido pelo `drizzle-kit`
  (`@esbuild-kit`); a falha afeta só o servidor de desenvolvimento do esbuild, que o
  `drizzle-kit` não usa. Ferramenta de desenvolvimento, fora da aplicação: risco desprezível;
  resolver com `npm update` quando o `drizzle-kit` atualizar a dependência.
- **Scripts de instalação não aprovados:** o `better-sqlite3` 13 já traz binários
  pré-compilados (`prebuilds/`); o script pendente (`node-gyp rebuild`) só compilaria do zero.
  `esbuild` e `unrs-resolver` funcionam sem os `postinstall`. Validado carregando o SQLite
  3.53.4 no Node 24 e executando o `tsx`.
- **`@types/better-sqlite3` 9.x com `better-sqlite3` 13:** o pacote não traz tipos próprios, e
  o `@types` mais recente é o 9.6.
- **`serverExternalPackages` explícito:** o Next 16 já externaliza o `better-sqlite3`
  automaticamente (lista interna); mantido no `next.config.ts` por exigência do PRD e para
  deixar a intenção explícita.
- **CHECKs além do texto literal do PRD:** `cliente.data_nascimento` só pode existir para PF;
  `qtd_parcelas` é obrigatória sempre que a forma de pagamento não é `A_VISTA`. As regras entre
  tabelas (datas proposta × venda, unidade da proposta × do vendedor, `valor_proposta ≤
  valor_tabela`, combustível × tipo) ficam no `db:check` (passo 1.5), como o PRD define.
- **WAL e conexão somente leitura:** uma conexão `readonly` não pode alterar o `journal_mode`.
  O WAL é ligado pelo `client.ts` e fica gravado no arquivo; o `readonly-client.ts` o herda
  (verificado: `journal_mode = wal`, `query_only = 1`).
- **Views:** colunas listadas explicitamente (sem `SELECT *`), para que coluna nova em tabela
  base nunca vaze sozinha. `faixa_etaria` usa a idade na data atual (`date('now')`), com a
  expressão repetida nas 3 views porque views não podem ser montadas sobre views.
  `desconto_percentual` vai de 0 a 100, com 2 casas. `dias_*` são inteiros calculados com
  `julianday`. `vw_desempenho_vendedor_mes` usa a unidade atual do vendedor.
- **Migration das views:** criada com `drizzle-kit generate --custom` (`drizzle/0001_views.sql`),
  porque o Drizzle não gera views a partir do schema.
- **Catálogo fixo:** 62 versões reais (37 leves, 15 motos, 10 pesados) com preços
  aproximados de 2025, sem aleatoriedade. `preco_tabela` é o preço atual; `ano_modelo` = 2025
  para todas. Renault Kwid Zen e Yamaha Factor 150 estão fora de linha (`ativo = 0`) e, no
  passo 1.4, só recebem propostas no primeiro ano do período.
- **Auxiliares do seed (`seed/documentos.ts`):** arquivo fora da lista do PRD, com CPF/CNPJ
  válidos (dígitos verificadores) e únicos, datas em UTC (independentes do fuso), telefones e slugs.
- **Dados de contato fictícios:** e-mails nos domínios `exemplo.com.br` e
  `autorede.exemplo.com.br`, para não coincidir com endereços reais.
- **Vendedores:** de 4 a 8 por unidade, ~15% admitidos no período, probabilidade de
  desligamento de 10%, com mínimo de 3 ativos por unidade. Resultado: 9 desligados de 71
  (12,7%), aceito como "~10%".
- **Clientes:** cada cliente nasce de uma unidade sorteada (85% na mesma UF dela); ~60%
  cadastrados antes do período e ~40% durante. No passo 1.4, cada proposta só usa clientes
  já cadastrados na data dela. O segundo sobrenome de PF nunca repete o primeiro.
- **Perfil fixo por unidade (`seed/propostas.ts`):** peso de volume, conversão base e tipos
  vendidos (8 unidades com motos, 6 com pesados). Cada vendedor tem volume (0,6–1,6) e
  conversão própria (base da unidade ±0,08, limitada a 20–50%).
- **Taxa de conversão:** GANHA / (GANHA + PERDIDA + CANCELADA). Resultado: 34,4% no geral, de
  23,9% a 39,7% por unidade.
- **Regras de proposta além do texto do PRD:** cliente precisa estar cadastrado na data; o
  fechamento não passa do desligamento do vendedor; perdas por PRECO têm desconto de 0–4%;
  CREDITO_NEGADO nunca em pagamento à vista; entrada só em financiamento (10–50%); produtos
  fora de linha só no primeiro ano; observações genéricas, sem dados pessoais, em ~20% das propostas.
- **IDs das propostas:** o RETURNING do SQLite não garante ordem; como a sequência é zerada e
  tudo roda numa transação, os IDs são 1..N na ordem de inserção (o seed confere e falha se não for).
- **NF:** formato `NF-UU-NNNNNN`, sequencial por unidade na ordem das datas de venda.
- **Metas:** calculadas depois das vendas, a partir da média mensal de cada vendedor (quantidade
  e valor independentes), com sazonalidade e variação aleatória. Mediana de quem bate a meta:
  56,7% (quantidade) e ~41% (valor). O primeiro e o último mês ficam abaixo da faixa
  (sem vendas anteriores / propostas ainda em negociação).
- **`db:check` com a conexão somente leitura:** a verificação só lê o banco, então usa o
  `readonly-client.ts` (menor privilégio).
- **ATTACH na conexão somente leitura (critério 9):** o ATTACH de arquivo falha, mas o
  better-sqlite3 não permite bloquear `ATTACH ':memory:'`. O banco anexado fica inerte
  (CREATE e tabelas TEMP falham) e o teste prova isso; o bloqueio total do ATTACH fica com o
  validador de SQL da Etapa 2 (camada 3). Decisão do desenvolvedor (opção a).
- **Achados para a Etapa 2:** `statement.readonly` é `true` para ATTACH (não serve para
  barrá-lo), e `PRAGMA query_only = OFF` é aceito por SQL. A escrita continua bloqueada pela
  abertura `readonly` do arquivo, mas o validador precisa recusar PRAGMA e ATTACH pelo parser.
- **Regra de lint para `src/lib/agent`:** bloqueia imports de `db/client`, do seed e do
  `better-sqlite3`/`drizzle-orm/better-sqlite3` (só `import type` é permitido), para o agente
  não abrir conexões próprias. Escolhida em vez de teste porque o erro aparece no editor.
- **Testes:** leem o banco real gerado pelo seed (provam o mesmo `client.ts` da aplicação e os
  dados gerados). A completude considera uma coluna coberta se ela aparece com o mesmo nome
  em `vw_<tabela>`. O teste trivial do passo 1.1 foi removido.
- **PRDs na raiz:** os PRDs das Etapas 2 a 4 ficam na raiz junto do PRD da Etapa 1 (decisão do
  desenvolvedor; o PRD da Etapa 2 previa copiá-los para `docs/prd/`). Ajustes nos PRDs ficam
  registrados no "Histórico de alterações" de cada um.
- **Modelos (Etapa 2):** IDs confirmados na documentação da Anthropic: `claude-haiku-5-5`
  (classificação) e `claude-sonnet-5-5` (SQL e resposta). Esses modelos rejeitam `temperature`
  diferente do padrão e o Sonnet 5.5 rejeita `tool_choice` forçado; o PRD da Etapa 2 foi ajustado
  (seção 4.1).
- **`@langchain/langgraph-cli` e `npm audit`:** a CLI traz `create-langgraph` → `extract-zip`
  2.0.1, com 3 vulnerabilidades altas (path traversal ao extrair .zip malicioso), sem correção
  disponível. Só o gerador de projetos (`langgraph new`) extrai .zip; o projeto usa apenas o
  `langgraph dev`. Ferramenta de desenvolvimento, fora da aplicação. **Nunca rodar
  `langgraph new`/`create-langgraph` neste projeto.** Rever com `npm update` quando houver correção.
- **Configuração do agente:** `src/lib/env.ts` valida todas as variáveis (texto vazio conta como
  ausente); `src/lib/agent/config.ts` organiza os limites da seção 7.4 e permite ajustes nos
  testes (`criarConfig`). `ANTHROPIC_API_KEY` só é exigida ao criar um modelo real.
- **Validador de SQL (passo 2.1):** as tabelas são resolvidas pela AST respeitando o escopo de
  cada `WITH`; o `tableList` do parser (sem escopo) é conferido como segunda trava. CTE que cita o
  próprio nome é tratada como recursiva mesmo sem `RECURSIVE` (o SQLite a trata assim). Nomes
  qualificados com schema (`main.`, `temp.`) são recusados. Comandos que o parser não entende
  (`PRAGMA`, `VACUUM`, `BEGIN`, `DETACH`...) reprovam pela regra 2 (falha fechada). Funções de
  janela exigem `PARTITION BY` (limitação do parser; ver Histórico do PRD 2). O `prepare` da
  regra 9 é injetável para teste.
- **Executor em processo filho (passo 2.2):** o PRD previa worker thread, mas a sonda mostrou que
  `worker.terminate()` não interrompe uma thread presa numa query cara do SQLite (o processo não
  terminava), e o `better-sqlite3` não tem interrupção. A query roda num processo filho
  (`src/lib/agent/sql/executor-worker.ts`, via `child_process.fork`) que é morto com `kill()` no
  timeout. O timeout conta a partir do aviso "pronto" do filho (a subida, ~300 ms, tem limite
  próprio de 15 s). Inteiros vêm com `safeIntegers` e viram número quando cabem sem perda, senão texto.
- **Modelos e prompts (passo 2.3):** os nós dependem da interface `ModelosAgente`
  (`classificar`/`escreverSql`/`responder`), para injetar modelos falsos nos testes. Classificação:
  Haiku 5.5 com raciocínio `disabled` e `effort` low; SQL: Sonnet 5.5 com `between_tools` e
  `effort` medium; resposta: Sonnet 5.5 com `between_tools` e `effort` low. Saída estruturada por
  JSON schema (`method: "jsonSchema"`). O fallback beta para recusas não foi ligado (reavaliar no
  passo 2.6). A query anterior vai ao prompt de correção na tag `<sql_anterior>`, que a seção 7.1
  não lista. A neutralização de tags vale para aberturas e fechamentos de **todas** as tags dos
  prompts (inclusive com espaços e maiúsculas), não só para o fechamento da tag correspondente.
  O prompt de SQL orienta `PARTITION BY 1` nas funções de janela (limitação do validador).
- **⚠️ Ponto de atenção para a Etapa 3 (executor):** o executor faz `fork` de um arquivo `.ts`
  com `--import tsx`. No build do Next.js esse arquivo não fica no bundle, e o `tsx` é dependência
  de desenvolvimento: será preciso empacotar/compilar o worker (ou outra estratégia de processo)
  e conferir o caminho do arquivo em produção.
