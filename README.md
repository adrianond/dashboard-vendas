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

Preencha o `.env.local` (nunca versionado). Nesta etapa, só `DATABASE_PATH` é obrigatória.

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
| `npm run db:studio` | abre o Drizzle Studio (ver abaixo) |

Os scripts `db:reset` e `db:check` entram nos próximos passos da Etapa 1.

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
> mão, rode `npm run db:check`; para voltar ao estado original, `npm run db:reset`
> (disponíveis a partir dos passos 1.4 e 1.5).

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
