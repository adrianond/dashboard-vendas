# Tabelas base

> **Somente para desenvolvedores.** Este documento descreve as tabelas base, que contêm dados
> pessoais e texto livre. **Ele nunca vai para o prompt do LLM**: o LLM só recebe
> [`schema.md`](schema.md), que descreve as views `vw_*` (CLAUDE.md, seção 4).
>
> A fonte da verdade é [`src/lib/db/schema.ts`](../src/lib/db/schema.ts); as migrations ficam em
> `drizzle/`. Ao mudar uma tabela, siga o passo a passo de [`drizzle.md`](drizzle.md).

## Relacionamentos

```
unidade 1───N vendedor 1───N meta_vendedor
   │              │
   1              1
   │              │
   N              N
   └──────── proposta N───1 cliente
                  │  N
                  │  └──────1 produto
                  1
                  │
                0..1
                venda
```

## Convenções

- Nomes em português, `snake_case`, singular; PK `id INTEGER PRIMARY KEY AUTOINCREMENT`.
- Datas em `TEXT` no formato `AAAA-MM-DD`; valores monetários em `REAL` (R$, 2 casas).
- Domínios fechados em `TEXT` maiúsculo com `CHECK`; flags `ativo` são `INTEGER` 0/1.
- Valores deriváveis não são armazenados (ex.: o desconto é calculado nas views).

## Tabelas

### `unidade` — concessionárias da rede

Nome e CNPJ únicos; endereço completo (`logradouro`, `numero`, `bairro`, `cidade`, `uf`, `cep`),
`telefone`, `email`, `data_inauguracao` e `ativo`. `uf` tem 2 letras; `regiao` ∈ `NORTE`,
`NORDESTE`, `CENTRO_OESTE`, `SUDESTE`, `SUL`.

### `vendedor` — vendedores de cada unidade

FK `unidade_id`; `cpf` e `email` únicos; `telefone`; `data_admissao`; `data_desligamento`
(NULL enquanto trabalha na rede); `ativo` (0 quando desligado). Índice em `unidade_id`.

### `cliente` — compradores (PF ou PJ)

`tipo_pessoa` ∈ `PF`, `PJ`; `nome` (razão social se PJ); `documento` (CPF ou CNPJ, único);
`email` (opcional); `telefone`; `cidade`, `uf`; `data_nascimento` (só PF — CHECK impede em PJ);
`data_cadastro`.

### `produto` — catálogo de veículos

`marca`, `modelo`, `versao`, `descricao`, `tipo_veiculo` (`LEVE`, `MOTO`, `PESADO`),
`categoria` (coerente com o tipo, por CHECK composto), `combustivel`, `ano_modelo`,
`preco_tabela` (> 0, preço atual) e `ativo`. Único por (`marca`, `modelo`, `versao`, `ano_modelo`).

| `tipo_veiculo` | Categorias permitidas |
|---|---|
| `LEVE` | `HATCH`, `SEDAN`, `SUV`, `PICAPE`, `UTILITARIO` |
| `MOTO` | `STREET`, `TRAIL`, `SCOOTER`, `ESPORTIVA`, `CUSTOM` |
| `PESADO` | `CAMINHAO`, `ONIBUS` |

### `proposta` — negociações de venda

FKs `unidade_id`, `vendedor_id`, `cliente_id`, `produto_id`. `unidade_id` é redundante com a
unidade do vendedor **de propósito**: registra a unidade no momento da proposta (preserva o
histórico se o vendedor for transferido).

- `data_proposta`; `valor_tabela` (preço de tabela **na data da proposta**); `valor_proposta` (> 0).
- `forma_pagamento` ∈ `A_VISTA`, `FINANCIAMENTO`, `CONSORCIO`, `LEASING`; `valor_entrada`
  obrigatório em financiamento; `qtd_parcelas` obrigatória quando não é à vista.
- `status` ∈ `EM_NEGOCIACAO`, `GANHA`, `PERDIDA`, `CANCELADA`; `data_fechamento` obrigatória
  quando o status não é `EM_NEGOCIACAO`; `motivo_perda` obrigatório quando `PERDIDA`.
- `observacao`: texto livre (fica fora das views).
- Índices em `data_proposta`, `status`, `unidade_id`, `vendedor_id`, `produto_id`, `cliente_id`.

### `venda` — propostas efetivadas (faturadas)

FK `proposta_id` (única: no máximo uma venda por proposta); `data_venda`; `valor_final` (> 0);
`numero_nota_fiscal` (único, `NF-UU-NNNNNN`); `data_entrega` (NULL se ainda não entregue; CHECK
`data_entrega >= data_venda`). Existe venda **se e somente se** a proposta está `GANHA`; unidade,
vendedor, cliente e produto vêm do JOIN com `proposta`. Índice em `data_venda`.

### `meta_vendedor` — metas mensais

FK `vendedor_id`; `ano`, `mes` (1–12); `meta_quantidade` (> 0); `meta_valor` (> 0). Única por
(`vendedor_id`, `ano`, `mes`).

## Colunas fora das views

Toda coluna das tabelas base aparece numa view `vw_*` **ou** está em `EXCLUDED_COLUMNS`
([`src/lib/db/views.ts`](../src/lib/db/views.ts)), com o motivo; o teste de completude
(`tests/db.views.test.ts`) falha se uma coluna nova não tiver essa decisão.

| Tabela | Colunas excluídas | Motivo |
|---|---|---|
| `unidade` | `cnpj`, `logradouro`, `numero`, `bairro`, `cep`, `telefone`, `email` | desnecessárias para análise |
| `vendedor` | `cpf`, `email`, `telefone` | dados pessoais |
| `cliente` | `nome` (exposto só como `razao_social`, quando PJ), `documento`, `email`, `telefone`, `data_nascimento` (exposta só como `faixa_etaria`) | dados pessoais |
| `proposta` | `observacao` | texto livre: pode conter dados pessoais e é vetor de injeção de prompt |
| `venda` | `numero_nota_fiscal` | desnecessário para análise |

## Regras verificadas pelo `db:check`

Além das constraints do schema, `npm run db:check` (e `tests/db.integrity.test.ts`) confere as
regras entre tabelas, definidas em [`src/lib/db/check.ts`](../src/lib/db/check.ts): chaves
estrangeiras válidas; venda ⇔ proposta `GANHA`; unidade da proposta = unidade do vendedor;
proposta dentro do período ativo do vendedor; datas de fechamento, venda e entrega coerentes;
`valor_proposta ≤ valor_tabela`; categoria e combustível coerentes com o tipo de veículo; os três
tipos de veículo com propostas e vendas.
