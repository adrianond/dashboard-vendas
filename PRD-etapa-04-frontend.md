# PRD — Etapa 4: Frontend do dashboard

> **Projeto:** Dashboard de Vendas de Veículos (rede de concessionárias franqueadas)
> **Etapa:** 4 de 4 (telas do dashboard + chat de perguntas em linguagem natural)
> **Executor:** Claude Code
> **Pré-requisito:** Etapa 3 concluída e aprovada (API documentada em `docs/api.md`, indicadores, agente com streaming, metas de qualidade atingidas)
> **Status:** Pronto para execução (sujeito à revisão do passo 4.0)

---

## 0. Protocolo de execução e ajustes de PRD

O protocolo **anunciar → confirmar → executar** do `CLAUDE.md` continua obrigatório.

Nesta etapa, além do anúncio, **toda tela nova ou mudança visual relevante é apresentada ao desenvolvedor com capturas de tela** (desktop e celular) geradas pelo Playwright, antes do commit do passo.

**Ajustes neste PRD:** este documento foi escrito antes da execução das Etapas 2 e 3. Se a API real (`docs/api.md`) divergir do que está aqui, **o contrato da API prevalece** e o Claude Code propõe a correção neste PRD:
1. anunciar a correção mostrando o trecho atual e o novo;
2. aplicar somente após confirmação;
3. registrar em "Histórico de alterações" no fim deste arquivo.

Correções que afrouxem regras de segurança (seção 8) nunca são feitas como ajuste de PRD: são reportadas para decisão do desenvolvedor.

---

## 1. Contexto

As Etapas 1 a 3 entregaram o banco, o agente text-to-SQL validado com métricas e uma API segura. Esta é a etapa final: as telas que o usuário vai usar.

O produto tem duas formas de consulta que convivem na mesma interface:

- **Dashboard:** indicadores fixos com filtros (período, unidade, região, tipo de veículo), em cartões, gráficos e tabelas. Rápido, previsível, sem LLM.
- **Pergunte aos dados:** um chat onde o usuário escreve perguntas em português e recebe a resposta do agente, com os dados que a sustentam.

### Roadmap

| Etapa | Escopo |
|---|---|
| 1 ✅ | Fundação, dados, views seguras |
| 2 ✅ | Agente LangGraph |
| 3 ✅ | API e qualidade |
| **4 (este PRD)** | Frontend do dashboard e chat |

## 2. Objetivo desta etapa

1. Página **Dashboard** com filtros, cartões de indicadores, gráficos e tabelas.
2. **Chat "Pergunte aos dados"**, em página própria e em painel lateral no dashboard, com progresso em tempo real, dados de apoio, gráfico automático simples, exportação CSV e feedback.
3. Interface **responsiva**, com **tema claro e escuro** e **acessível** (WCAG 2.1 AA).
4. Testes de componentes, testes ponta a ponta com Playwright e verificação automática de acessibilidade.
5. Fechamento do projeto: checklist final de ponta a ponta.

## 3. Fora de escopo

- Autenticação, perfis de acesso e deploy (continuam como requisito antes de publicar, já registrado no README).
- Novos indicadores ou rotas de API. Se uma tela precisar de algo que a API não oferece, **pare e reporte**; não crie consultas novas no frontend.
- Edição de dados de qualquer tipo. O produto é somente leitura.
- Alterações no agente, prompts, validador ou guardrails.

## 4. Stack (adições)

| Item | Escolha | Observação |
|---|---|---|
| Componentes | shadcn/ui (Radix + Tailwind) | Componentes copiados para `src/components/ui`, acessíveis por padrão |
| Gráficos | Recharts | Componentes cliente, com wrappers próprios em `src/components/graficos` |
| Ícones | lucide-react | Já usado pelo shadcn/ui |
| Tema | next-themes | Claro, escuro e "seguir o sistema" |
| Testes de componentes | vitest + @testing-library/react + jsdom | |
| Testes ponta a ponta | @playwright/test (Chromium) | Com `AGENT_MODE=fake` |
| Acessibilidade | @axe-core/playwright | Nenhuma violação séria ou crítica |

Usar as versões estáveis mais recentes. Não adicionar bibliotecas de gerenciamento de estado global: URL (filtros) e estado local de componentes bastam.

## 5. Arquitetura do frontend

### 5.1 Onde os dados são buscados

- **Dashboard:** página **Server Component**. Lê os filtros dos `searchParams`, valida com o mesmo schema zod da Etapa 3 e chama **diretamente** as funções de `src/lib/indicadores` (a mesma fonte de verdade das rotas `/api/indicadores/*`), sem passar por HTTP. Cada seção fica dentro de um `<Suspense>` próprio com *skeleton*, para a página aparecer aos poucos.
- **Gráficos e tabelas interativas:** Client Components que recebem os dados prontos por props. Nunca importam módulos de servidor (`server-only` garante isso no build).
- **Chat:** Client Component que chama `POST /api/agente/perguntar/stream` com `fetch` e lê o stream (SSE sobre `fetch`, porque `EventSource` não suporta POST). Feedback via `POST /api/agente/feedback`.

### 5.2 Filtros na URL

Todos os filtros ficam na query string (`/?inicio=2025-01-01&fim=2025-12-31&tipoVeiculo=SUV…`). Assim o estado sobrevive a recarregar a página e pode ser compartilhado por link. Valores inválidos na URL são descartados (volta ao padrão) com um aviso discreto, nunca com erro de página.

### 5.3 Estrutura de pastas (adições)

```
src/
├── app/
│   ├── layout.tsx                 # shell: cabeçalho, navegação, tema, provedores
│   ├── page.tsx                   # Dashboard
│   ├── loading.tsx
│   ├── error.tsx                  # erro amigável, sem detalhes técnicos
│   ├── not-found.tsx
│   └── perguntar/
│       └── page.tsx               # Chat em página inteira
├── components/
│   ├── ui/                        # shadcn/ui
│   ├── layout/                    # cabeçalho, navegação, alternador de tema
│   ├── filtros/                   # barra de filtros e seletor de período
│   ├── indicadores/               # cartões de KPI
│   ├── graficos/                  # wrappers de Recharts
│   ├── tabelas/                   # tabelas de ranking, unidades, metas
│   └── chat/                      # chat, mensagens, progresso, dados, feedback
└── lib/
    ├── format.ts                  # moeda, número, percentual, data, mês (pt-BR)
    ├── csv.ts                     # exportação CSV segura
    └── chat/
        ├── sse.ts                 # leitor de SSE sobre fetch
        ├── api.ts                 # chamadas do chat e mapeamento de erros
        └── auto-grafico.ts        # decide se o resultado vira gráfico
tests/
├── ui/                            # testes de componentes
└── e2e/                           # Playwright
    ├── dashboard.spec.ts
    ├── chat.spec.ts
    ├── acessibilidade.spec.ts
    └── screenshots.spec.ts
```

## 6. Direção visual

- **Personalidade:** ferramenta de trabalho para gestores comerciais. Sóbria, densa em informação, legível. Nada de decoração que não carregue dado.
- **Tipografia:** uma família sem serifa com números tabulares (`font-variant-numeric: tabular-nums`) em todos os valores, para colunas alinharem.
- **Cores:** paleta neutra para a interface; cor reservada para dados e estados. Paleta categórica de no máximo 6 cores, segura para daltonismo, definida como tokens CSS e usada em todos os gráficos; uma cor fixa por tipo de veículo e por região em todas as telas. Positivo/negativo nas variações com cor **e** ícone/sinal (nunca só cor).
- **Tema claro e escuro:** todos os tokens (inclusive cores dos gráficos) definidos para os dois temas, com contraste AA.
- **Gráficos:**
  - eixos com rótulos legíveis e valores formatados em pt-BR (`R$ 1,2 mi`, `35,4%`, `jan/25`);
  - tooltip com valores completos;
  - sem gráfico de pizza; participações em barras horizontais ordenadas;
  - linha para séries temporais, barras para comparações entre categorias;
  - legenda só quando houver mais de uma série;
  - todo gráfico tem título, descrição curta e uma alternativa em tabela acessível (botão "ver como tabela").
- **Estados:** cada seção tem estado de carregamento (*skeleton* com o formato do conteúdo), estado vazio ("Sem vendas para esses filtros", com sugestão de ampliar o período) e estado de erro (mensagem amigável e botão "tentar novamente").
- **Responsividade:** desenho pensado primeiro para desktop (≥ 1280 px), funcionando bem até 375 px de largura sem rolagem horizontal da página. Tabelas largas rolam dentro do próprio contêiner. Filtros viram um painel recolhível no celular.
- **Idioma e formatos:** toda a interface em português do Brasil; datas `dd/mm/aaaa`; moeda `R$ 1.234.567,89`; abreviações `mil`, `mi`, `bi` em gráficos e cartões, valor completo no tooltip.

## 7. Telas

### 7.1 Shell (layout)

- Cabeçalho com nome do produto, navegação (Dashboard, Pergunte aos dados), alternador de tema e botão "Pergunte aos dados" que abre o chat em painel lateral (`Sheet`) sem sair do dashboard.
- Indicação discreta da data de referência dos dados ("Dados até 30/09/2026", a partir de `/api/filtros`).
- Link "pular para o conteúdo" para teclado.

### 7.2 Dashboard (`/`)

**Barra de filtros** (fixa no topo ao rolar, no desktop):
- Período com atalhos (Últimos 3, 6 e 12 meses, Ano atual, Ano anterior, Personalizado), limitado ao intervalo disponível e ao máximo de 36 meses.
- Unidade, região e tipo de veículo (seletores com busca quando a lista for longa); categoria aparece quando um tipo é escolhido.
- Botão "limpar filtros". Resumo dos filtros ativos em *chips* removíveis.

**Seções**, nesta ordem:

| Seção | Fonte | Visualização |
|---|---|---|
| Cartões de KPI | `resumo` | 6 cartões: receita, vendas, ticket médio, conversão, desconto médio, propostas em negociação. Cada um com a variação vs. período anterior (seta, sinal e cor) |
| Evolução mensal | `serie-mensal` | Linha de receita por mês, com alternância para quantidade de vendas e conversão |
| Receita por região | `por-regiao` | Barras horizontais ordenadas, com participação (%) |
| Mix por tipo de veículo | `por-tipo-veiculo` | Barras por tipo, com detalhamento por categoria ao expandir |
| Funil de propostas | `funil` | Barras por status + taxa de conversão em destaque + motivos de perda em barras ordenadas + tempo médio até o fechamento |
| Ranking de vendedores | `ranking-vendedores` | Tabela ordenável (receita, vendas, conversão, desconto), com unidade; top 10 com opção de ver 50 |
| Ranking de produtos | `ranking-produtos` | Tabela com alternância entre "por quantidade" e "por receita" |
| Desempenho das unidades | `por-unidade` | Tabela com receita, vendas, conversão e atingimento médio de meta (barra inline) |
| Metas | `metas` | Barras por mês com % de vendedores que bateram a meta + tabela do mês mais recente (vendedor, meta, realizado, atingimento) |

Cada seção pode levar a uma pergunta no chat: um botão "Perguntar sobre isto" abre o painel do chat com uma sugestão de pergunta relacionada e os filtros atuais escritos em texto (ex.: "Por que a conversão caiu em março de 2026 na região Sul?"). O usuário edita antes de enviar; nada é enviado automaticamente.

### 7.3 Chat "Pergunte aos dados" (`/perguntar` e painel lateral)

O mesmo componente atende às duas formas.

**Antes da primeira pergunta:** texto curto explicando o que dá para perguntar e 6 sugestões clicáveis (uma por grupo: faturamento, ranking, funil, metas, recorte por região, comparação entre períodos).

**Envio:**
- Campo de texto com contador de caracteres (limite igual a `AGENT_MAX_PERGUNTA_CHARS`); `Enter` envia, `Shift+Enter` quebra linha.
- Durante a execução: campo desabilitado, botão "Cancelar" (aborta o `fetch`) e lista de etapas em tempo real a partir dos eventos `etapa` ("Entendendo a pergunta" → "Montando a consulta" → …), com a etapa atual destacada e as concluídas marcadas.

**Resposta (`status = OK`):**
- Texto da resposta, renderizado como **texto puro** (quebras de linha preservadas). Sem HTML e sem Markdown com links ou imagens.
- Bloco recolhível "Ver dados": tabela com as colunas retornadas, cabeçalhos legíveis (nomes de coluna convertidos de `snake_case` para texto) e valores formatados por tipo detectado (moeda quando o nome indicar valor/receita, percentual quando indicar `pct`/`percentual`/`taxa`, data quando for `YYYY-MM-DD`). Aviso quando `truncado = true`.
- **Gráfico automático** (`auto-grafico.ts`), exibido acima da tabela somente quando o resultado tiver de 2 a 30 linhas, uma coluna de texto ou período e de 1 a 3 colunas numéricas: linha se a coluna de texto for período (`YYYY-MM`, `YYYY`), barras horizontais nos demais casos. Em qualquer outro formato, só a tabela.
- Botão "Exportar CSV" (seção 8).
- Bloco "Ver SQL" **somente** se a API devolver `sql` diferente de `null`.
- Feedback: 👍 / 👎, com campo opcional de comentário ao escolher 👎; envio único por resposta; confirmação visual "Obrigado pelo retorno".

**Recusa (`RECUSADO`) e falha (`FALHA`):** exibir a mensagem da API em estilo neutro (sem tom de erro de sistema), mais 2 sugestões de perguntas válidas.

**Erros da API**, mapeados pelo código (seção 7.1 do PRD 3):

| Código | Mensagem ao usuário |
|---|---|
| `LIMITE_EXCEDIDO` | "Você atingiu o limite de perguntas. Tente novamente em X min." (usar `Retry-After`) |
| `OCUPADO` | "Muitas perguntas sendo processadas agora. Tente novamente em instantes." |
| `TEMPO_ESGOTADO` | "A pergunta demorou demais. Tente algo mais específico, como um período menor." |
| `ENTRADA_INVALIDA` / `CORPO_GRANDE` | "Não foi possível enviar a pergunta. Verifique o texto e tente de novo." |
| Outros / rede | "Algo deu errado. Tente novamente." + botão de reenviar |

Nunca exibir `requestId`, códigos técnicos ou mensagens cruas da API, exceto o `requestId` num texto pequeno "código para suporte" em erros 500.

**Conversa:**
- `threadId` guardado em `sessionStorage` (com `try/catch`; se falhar, mantém em memória) para que perguntas de acompanhamento funcionem ao recarregar a página.
- Botão "Nova conversa" limpa o histórico visual e o `threadId`.
- Histórico visível rola sozinho para a última mensagem, sem tirar o foco do campo de texto; um leitor de tela anuncia a chegada da resposta (`aria-live="polite"`).

## 8. Segurança no frontend

- **Nenhum** `dangerouslySetInnerHTML`. Respostas do agente, nomes vindos do banco e mensagens da API são sempre renderizados como texto pelo React.
- **Exportação CSV** segura contra *CSV injection*: células que começam com `=`, `+`, `-`, `@`, tab ou retorno de carro recebem um apóstrofo no início; separador `;`, codificação UTF-8 com BOM (abre corretamente no Excel em pt-BR); nome do arquivo sem dados do usuário (`dados-AAAA-MM-DD-HHmm.csv`).
- Client Components nunca importam módulos de `src/lib/db`, `src/lib/agent`, `src/lib/indicadores` ou `src/lib/agent-runtime` (protegidos por `import "server-only"`; o build deve falhar se isso acontecer).
- Nenhuma variável `NEXT_PUBLIC_` com segredo. Se for preciso expor um valor ao navegador (ex.: limite de caracteres), ele vem da API ou de props do Server Component.
- **CSP:** ajustar a política da Etapa 3 para o mínimo necessário às telas. Preferir *nonce* para scripts (via `middleware.ts`, conforme a documentação do Next.js), sem `unsafe-eval` em produção. Se for necessário `unsafe-inline` para estilos (Recharts usa estilos inline), documentar o motivo em "Decisões". `connect-src 'self'`.
- Links externos (se houver) com `rel="noopener noreferrer"`.

## 9. Acessibilidade (WCAG 2.1 AA)

- Navegação completa por teclado, com foco visível e ordem lógica; painel do chat prende o foco enquanto aberto e devolve ao botão de origem ao fechar.
- Contraste mínimo AA nos dois temas, inclusive em cores de gráfico sobre o fundo.
- Gráficos com `role="img"` e `aria-label` descritivo, mais a alternativa em tabela.
- Variações (alta/queda) comunicadas por texto, não só por cor ("+12,3% vs. período anterior").
- Respeitar `prefers-reduced-motion` (sem animações de gráfico quando ativado).
- `@axe-core/playwright` sem violações de impacto `serious` ou `critical` em todas as páginas e estados principais (incluindo painel do chat aberto e tema escuro).

## 10. Desempenho

- Dashboard: as seções carregam em paralelo (cada uma no seu `Suspense`); o primeiro conteúdo aparece em menos de 1,5 s em `next start` local.
- Recharts carregado apenas nos Client Components de gráfico.
- Chat: a primeira etapa de progresso aparece em menos de 1 s após o envio (com `AGENT_MODE=fake`).
- Sem requisições repetidas ao trocar de aba ou abrir/fechar o painel do chat.

## 11. Testes

| Arquivo | Ferramenta | Cobre |
|---|---|---|
| `tests/ui/format.test.ts` | vitest | Moeda, percentual, abreviações (`mil`, `mi`, `bi`), datas e meses em pt-BR, valores nulos |
| `tests/ui/csv.test.ts` | vitest | Escape de *CSV injection*, separador, BOM, aspas e quebras de linha |
| `tests/ui/sse.test.ts` | vitest | Leitor de SSE: eventos fragmentados entre pedaços do stream, múltiplos eventos num pedaço, cancelamento |
| `tests/ui/auto-grafico.test.ts` | vitest | Escolha entre linha, barras ou só tabela para formatos de resultado variados |
| `tests/ui/componentes.test.tsx` | Testing Library | Cartão de KPI (variação positiva/negativa/nula), tabela ordenável, estados vazio/erro, mensagens de erro do chat por código |
| `tests/e2e/dashboard.spec.ts` | Playwright | Carrega com filtros padrão; valores dos cartões batem com `/api/indicadores/resumo`; mudar filtros atualiza URL e valores; filtro inválido na URL cai no padrão com aviso; "limpar filtros"; tabela ordenável; "ver como tabela" nos gráficos; funciona em 375 px sem rolagem horizontal |
| `tests/e2e/chat.spec.ts` | Playwright (`AGENT_MODE=fake`) | Sugestão clicável envia pergunta; etapas aparecem em ordem; resposta, "Ver dados", gráfico automático e CSV; pergunta de acompanhamento; recusa; falha; cancelar; erro 429 com tempo de espera; feedback 👍/👎; "Nova conversa"; painel lateral a partir do dashboard com "Perguntar sobre isto" |
| `tests/e2e/acessibilidade.spec.ts` | Playwright + axe | Dashboard, chat (vazio, com resposta, com erro), painel aberto, tema claro e escuro; navegação só por teclado do fluxo principal |
| `tests/e2e/screenshots.spec.ts` | Playwright | Gera capturas em 1440 px e 390 px, temas claro e escuro, das telas principais, salvas em `tests/e2e/screenshots/` (gitignored) para revisão |

O Playwright sobe `next build && next start` com `AGENT_MODE=fake` e `ALLOW_FAKE_AGENT_IN_PROD=true`, como na Etapa 3. Script `test:ui` (vitest dos componentes) e `test:e2e:ui` (Playwright). A instalação do navegador do Playwright (`npx playwright install chromium`) é anunciada antes.

## 12. Critérios de aceite

1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:ui`, `npm run test:e2e`, `npm run test:e2e:ui` e `npm run build` passam.
2. Dashboard exibe todas as seções da seção 7.2, com filtros na URL, estados de carregamento, vazio e erro.
3. Chat funciona na página e no painel lateral, com progresso em tempo real, dados, gráfico automático, CSV, feedback e tratamento de todos os códigos de erro da seção 7.3.
4. Nenhuma violação `serious`/`critical` do axe; fluxo principal completo só com teclado.
5. Telas funcionam em 375 px e 1440 px, nos temas claro e escuro (capturas aprovadas pelo desenvolvedor).
6. Nenhum `dangerouslySetInnerHTML` no código (verificado por regra de lint ou teste que busca no código-fonte).
7. CSP ajustada e documentada; nenhum erro de CSP no console do navegador nos testes e2e.
8. **Teste final com LLM real** (tem custo; anunciar antes): com `AGENT_MODE=real`, fazer pela interface 5 perguntas do dataset gold e 2 do red team; respostas corretas e recusas adequadas; traces e feedback visíveis no LangSmith.
9. `npm run db:check` sem violações e contagens idênticas às do fim da Etapa 1.
10. README final com: visão geral do produto, arquitetura (diagrama simples das camadas), como rodar tudo do zero, todos os scripts, como validar (testes, Studio, LangSmith, avaliações), limitações conhecidas e requisitos antes de publicar (autenticação, rate limit distribuído, checkpointer de produção, revisão da CSP).

## 13. Plano de execução (passos)

Execute os passos **na ordem**. Dentro de cada passo, toda ação segue o protocolo do `CLAUDE.md`. Ao concluir cada passo: rode a verificação, gere as capturas de tela quando houver mudança visual, anuncie o commit, aguarde confirmação, apresente o resumo e aguarde aprovação para o próximo.

---

### Passo 4.0 — Revisão do PRD contra a API real

**Tarefas:**
- Ler `docs/api.md`, o README, a seção "Decisões" e `src/lib/indicadores`.
- Listar divergências entre este PRD e a API real e propor correções conforme a seção 0.
- Confirmar as versões atuais de shadcn/ui, Recharts e Playwright compatíveis com a versão do Next.js e do React instaladas.

**Verificação:** divergências aprovadas e PRD corrigido com "Histórico de alterações".
**Commit:** `docs: revisão do PRD da etapa 4`

---

### Passo 4.1 — Fundação visual

**Tarefas:**
- Instalar e configurar shadcn/ui, next-themes, lucide-react e Recharts.
- Definir tokens de cor (interface e paleta de dados, claro e escuro), tipografia com números tabulares e espaçamentos.
- Implementar o shell (seção 7.1), `error.tsx`, `not-found.tsx`, `lib/format.ts` e seus testes.
- Configurar Playwright e o teste de capturas de tela.

**Verificação:** shell navegável, tema alternando, testes de formatação passam, capturas do shell aprovadas.
**Commit:** `feat(ui): fundação visual, tema e shell`

---

### Passo 4.2 — Filtros e cartões de KPI

**Tarefas:** barra de filtros com URL (seção 5.2 e 7.2), cartões de KPI com variação, estados de carregamento/vazio/erro, testes de componente.
**Verificação:** e2e dos filtros passa; capturas aprovadas.
**Commit:** `feat(ui): filtros e indicadores principais`

---

### Passo 4.3 — Gráficos

**Tarefas:** wrappers de gráfico com a direção da seção 6 (incluindo "ver como tabela" e acessibilidade); seções de evolução mensal, região, tipo de veículo, funil e metas.
**Verificação:** gráficos corretos para os filtros padrão e para um recorte; axe sem violações; capturas aprovadas.
**Commit:** `feat(ui): gráficos do dashboard`

---

### Passo 4.4 — Tabelas

**Tarefas:** rankings de vendedores e produtos, desempenho das unidades e tabela de metas, com ordenação e rolagem horizontal contida.
**Verificação:** e2e de ordenação e responsividade em 375 px; capturas aprovadas.
**Commit:** `feat(ui): tabelas de ranking, unidades e metas`

---

### Passo 4.5 — Chat

**Tarefas:** `lib/chat` (SSE, chamadas, erros, gráfico automático), `lib/csv.ts`, componentes do chat (seção 7.3), página `/perguntar`, painel lateral e botões "Perguntar sobre isto"; testes unitários e e2e do chat.
**Verificação:** `chat.spec.ts` passa integralmente com `AGENT_MODE=fake`; capturas aprovadas.
**Commit:** `feat(ui): chat pergunte aos dados`

---

### Passo 4.6 — Segurança, acessibilidade e desempenho

**Tarefas:** ajustar a CSP (seção 8), verificação de ausência de `dangerouslySetInnerHTML`, `acessibilidade.spec.ts` completo, conferir metas da seção 10.
**Verificação:** critérios 4, 6 e 7.
**Commit:** `feat(ui): CSP, acessibilidade e desempenho`

---

### Passo 4.7 — Validação final e fechamento do projeto

**Tarefas:**
- Rodar todos os testes de todas as etapas.
- Teste final com LLM real pela interface (critério 8; tem custo, anunciar antes).
- Rodar `eval:run` uma última vez nos dois datasets para confirmar que nada regrediu (tem custo, anunciar antes).
- Escrever o README final (critério 10) e atualizar "Decisões".

**Verificação:** todos os critérios da seção 12, com evidências no resumo final: saída dos testes, capturas de tela, links dos traces e do experimento final no LangSmith, `db:check`.
**Commit:** `docs: fechamento do projeto`

---

## 14. Regras gerais para o Claude Code

- Siga o `CLAUDE.md`, em especial o protocolo anunciar → confirmar → executar.
- Siga os passos da seção 13 em ordem.
- O contrato em `docs/api.md` prevalece sobre este PRD; divergências viram ajuste de PRD (seção 0).
- Não altere API, agente, prompts, validador, guardrails, banco ou views nesta etapa. Necessidades fora do escopo são reportadas.
- Nunca afrouxe uma regra de segurança para fazer uma tela funcionar.

## Histórico de alterações

| Data | Seção | Alteração | Motivo |
|---|---|---|---|
| — | — | Versão inicial | — |
