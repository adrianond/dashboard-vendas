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

Os scripts do banco (`db:*`) entram nos próximos passos da Etapa 1.

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
