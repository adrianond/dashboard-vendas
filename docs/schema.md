# Schema para consultas — Dashboard de Vendas de Veículos

Banco **SQLite**, acessado **somente para leitura**, com dados de uma rede de concessionárias
franqueadas. Para consultas existem **apenas as 10 views `vw_*` descritas neste documento**;
nenhum outro objeto pode ser consultado.

**Regras para escrever o SQL**

- Uma única instrução `SELECT` (pode começar com `WITH`). Nada de escrita, `PRAGMA` ou `ATTACH`.
- Sempre com `LIMIT`, de no máximo **500** linhas.
- Datas são texto no formato `'AAAA-MM-DD'`; compare com `BETWEEN`, `>=` e `<`. Prefira as colunas
  prontas `ano_*`, `mes_*` (inteiros) e `ano_mes_*` (`'AAAA-MM'`) para agrupar por período.
- Valores monetários estão em **reais (R$)**, com 2 casas decimais.
- Domínios fechados (status, categorias, regiões etc.) estão em **MAIÚSCULAS**, sem acento,
  exatamente como listados abaixo.
- Os dados cobrem propostas de **2024-10-01 a 2026-09-30**. Períodos relativos ("último
  trimestre", "mês passado") devem ser convertidos em datas explícitas antes de consultar.
- **Dados pessoais não estão disponíveis**: nome de cliente pessoa física, documentos (CPF/CNPJ),
  e-mails, telefones, endereços e data de nascimento. O nome do vendedor e a razão social de
  clientes pessoa jurídica estão disponíveis para análises comerciais.

---

## 1. Guia de escolha da view

| Pergunta sobre... | Use | Por quê |
|---|---|---|
| Faturamento, vendas, receita, ticket médio, ranking de vendedores/produtos/unidades por vendas, prazos de entrega | **`vw_venda_detalhada`** | Uma linha por venda, já com unidade, vendedor, produto e cliente. Não precisa de JOIN. |
| Funil, propostas, taxa de conversão, motivos de perda, cancelamentos, propostas em negociação, descontos oferecidos | **`vw_proposta_detalhada`** | Uma linha por proposta, em qualquer status, com o resultado (vendida ou não). |
| Metas, atingimento, quem bateu a meta | **`vw_desempenho_vendedor_mes`** | Uma linha por vendedor por mês, com meta e realizado já calculados. |
| Algo que nenhuma das três responde (ex.: cadastro de vendedores, catálogo de produtos, clientes por UF) | views por tabela (seções 4 e 5) | Combine com JOIN usando a seção 6 (Relacionamentos). |

Sempre que possível, use uma das três visões analíticas sozinha: elas já trazem os JOINs e os
campos derivados mais pedidos. `vw_desempenho_vendedor_mes` tem agregação interna; use-a sozinha,
sem JOINs pesados.

---

## 2. Regras de negócio e definições

- **Proposta × venda:** toda negociação começa como uma proposta. A **venda existe somente para
  proposta com status `GANHA`** (uma venda por proposta ganha). Propostas `PERDIDA`, `CANCELADA`
  ou `EM_NEGOCIACAO` não têm venda.
- **Receita de vendas** = `SUM(valor_final)` das vendas.
- **Quantidade vendida** = número de vendas (`COUNT(*)` em `vw_venda_detalhada`).
- **Ticket médio** = `AVG(valor_final)` das vendas.
- **Taxa de conversão** = propostas `GANHA` ÷ propostas fechadas (`GANHA` + `PERDIDA` +
  `CANCELADA`). Propostas `EM_NEGOCIACAO` não entram no cálculo.
- **Qual data usar:**
  - faturamento e vendas → `data_venda` (ou `ano_venda`, `mes_venda`, `ano_mes_venda`);
  - volume de propostas, funil e conversão → `data_proposta` (ou `ano_proposta`, `mes_proposta`, `ano_mes_proposta`);
  - quando a negociação terminou → `data_fechamento`;
  - metas → `ano`, `mes` e `ano_mes` de `vw_desempenho_vendedor_mes` (o realizado é contado pela `data_venda`).
- **Desconto** = `valor_tabela − valor_proposta` (em R$). **`desconto_percentual`** vai de 0 a
  100 (ex.: `5.25` = 5,25%).
- **`valor_tabela`** é o preço de tabela **na data da proposta**; o preço atual do catálogo é
  `vw_produto.preco_tabela`.
- **Unidade da proposta** é a unidade no momento da proposta. Use-a para análises por unidade.
- **Metas** são mensais, por vendedor. Bateu a meta de quantidade quando `qtd_vendida >=
  meta_quantidade`; de valor, quando `valor_vendido >= meta_valor`.
- **Ativo** (`ativo`, `vendedor_ativo`): `1` = ativo, `0` = inativo (unidade desativada,
  vendedor desligado, produto fora de linha).

**Domínios**

| Coluna | Valores |
|---|---|
| `status` | `EM_NEGOCIACAO`, `GANHA`, `PERDIDA`, `CANCELADA` |
| `motivo_perda` | `PRECO`, `CREDITO_NEGADO`, `DESISTENCIA`, `CONCORRENCIA`, `PRAZO_ENTREGA` (só quando `PERDIDA`) |
| `forma_pagamento` | `A_VISTA`, `FINANCIAMENTO`, `CONSORCIO`, `LEASING` |
| `tipo_veiculo` | `LEVE` (automóveis e comerciais leves), `MOTO` (motocicletas e scooters), `PESADO` (caminhões e ônibus) |
| `categoria` | LEVE: `HATCH`, `SEDAN`, `SUV`, `PICAPE`, `UTILITARIO` · MOTO: `STREET`, `TRAIL`, `SCOOTER`, `ESPORTIVA`, `CUSTOM` · PESADO: `CAMINHAO`, `ONIBUS` |
| `combustivel` | `FLEX`, `GASOLINA`, `DIESEL`, `HIBRIDO`, `ELETRICO` |
| `regiao` | `NORTE`, `NORDESTE`, `CENTRO_OESTE`, `SUDESTE`, `SUL` |
| `tipo_pessoa` | `PF` (pessoa física), `PJ` (pessoa jurídica) |
| `faixa_etaria` | `18-29`, `30-44`, `45-59`, `60+` (só PF; idade atual) |
| `uf` | sigla da UF com 2 letras (ex.: `SP`, `RJ`) |

---

## 3. Visões analíticas (primeira escolha)

### `vw_venda_detalhada` — uma linha por venda

| Coluna | Significado |
|---|---|
| `venda_id` | Identificador da venda |
| `proposta_id` | Proposta que originou a venda |
| `data_venda` | Data da venda (faturamento), `'AAAA-MM-DD'` |
| `ano_venda`, `mes_venda` | Ano e mês da venda (inteiros) |
| `ano_mes_venda` | Ano e mês da venda, `'AAAA-MM'` |
| `valor_final` | Valor faturado (R$) — base da receita |
| `data_entrega` | Data de entrega do veículo; NULL se ainda não entregue |
| `dias_para_entrega` | Dias entre a venda e a entrega; NULL se não entregue |
| `data_proposta` | Data da proposta que originou a venda |
| `dias_para_fechamento` | Dias entre a proposta e a venda |
| `valor_tabela` | Preço de tabela na data da proposta (R$) |
| `valor_proposta` | Valor ofertado ao cliente (R$) |
| `desconto` | `valor_tabela − valor_proposta` (R$) |
| `desconto_percentual` | Desconto em % do valor de tabela (0 a 100) |
| `forma_pagamento` | Forma de pagamento (ver domínios) |
| `valor_entrada` | Entrada (R$); preenchida em financiamentos, NULL nos demais |
| `qtd_parcelas` | Número de parcelas; NULL quando à vista |
| `unidade_id`, `unidade_nome`, `unidade_cidade`, `unidade_uf`, `unidade_regiao` | Unidade (concessionária) da venda |
| `vendedor_id`, `vendedor_nome`, `vendedor_ativo` | Vendedor responsável |
| `produto_id`, `marca`, `modelo`, `versao`, `produto_descricao` | Veículo vendido |
| `tipo_veiculo`, `categoria`, `combustivel`, `ano_modelo` | Classificação do veículo |
| `cliente_id`, `cliente_tipo_pessoa` | Cliente comprador e tipo (`PF`/`PJ`) |
| `cliente_razao_social` | Razão social (só PJ; NULL para PF) |
| `cliente_cidade`, `cliente_uf` | Cidade e UF do cliente |
| `cliente_faixa_etaria` | Faixa etária (só PF; NULL para PJ) |

### `vw_proposta_detalhada` — uma linha por proposta (qualquer status)

| Coluna | Significado |
|---|---|
| `proposta_id` | Identificador da proposta |
| `data_proposta` | Data da proposta, `'AAAA-MM-DD'` |
| `ano_proposta`, `mes_proposta` | Ano e mês da proposta (inteiros) |
| `ano_mes_proposta` | Ano e mês da proposta, `'AAAA-MM'` |
| `status` | `EM_NEGOCIACAO`, `GANHA`, `PERDIDA`, `CANCELADA` |
| `data_fechamento` | Data em que a negociação terminou; NULL se em negociação |
| `dias_ate_fechamento` | Dias entre a proposta e o fechamento; NULL se em negociação |
| `motivo_perda` | Motivo da perda (só quando `PERDIDA`) |
| `valor_tabela`, `valor_proposta`, `desconto`, `desconto_percentual` | Mesmos significados de `vw_venda_detalhada` |
| `forma_pagamento`, `valor_entrada`, `qtd_parcelas` | Condições de pagamento propostas |
| `foi_vendida` | `1` se virou venda (status `GANHA`), `0` caso contrário |
| `venda_id`, `data_venda`, `valor_final` | Dados da venda; NULL se não vendida |
| Colunas de unidade, vendedor, produto e cliente | Mesmas de `vw_venda_detalhada` (`unidade_*`, `vendedor_*`, `produto_*`/`marca`/`modelo`..., `cliente_*`) |

### `vw_desempenho_vendedor_mes` — uma linha por vendedor por mês com meta

| Coluna | Significado |
|---|---|
| `vendedor_id`, `vendedor_nome` | Vendedor |
| `unidade_id`, `unidade_nome` | Unidade atual do vendedor |
| `ano`, `mes` | Ano e mês da meta (inteiros) |
| `ano_mes` | Ano e mês, `'AAAA-MM'` |
| `meta_quantidade` | Meta de veículos vendidos no mês |
| `meta_valor` | Meta de receita no mês (R$) |
| `qtd_vendida` | Vendas realizadas no mês (pela `data_venda`); 0 se nenhuma |
| `valor_vendido` | Receita realizada no mês (R$); 0 se nenhuma |
| `atingimento_quantidade_pct` | `qtd_vendida` em % da meta (100 = meta exata) |
| `atingimento_valor_pct` | `valor_vendido` em % da meta |
| `bateu_meta_quantidade` | `1` se `qtd_vendida >= meta_quantidade` |
| `bateu_meta_valor` | `1` se `valor_vendido >= meta_valor` |

---

## 4. Dimensões

### `vw_unidade` — concessionárias da rede

| Coluna | Significado |
|---|---|
| `id` | Identificador da unidade |
| `nome` | Nome da unidade |
| `cidade`, `uf`, `regiao` | Localização |
| `data_inauguracao` | Data de inauguração |
| `ativo` | `1` = em operação |

### `vw_vendedor` — vendedores

| Coluna | Significado |
|---|---|
| `id` | Identificador do vendedor |
| `unidade_id` | Unidade onde trabalha |
| `nome` | Nome do vendedor |
| `data_admissao` | Data de admissão |
| `data_desligamento` | Data de desligamento; NULL se ainda trabalha na rede |
| `ativo` | `1` = ativo, `0` = desligado |

### `vw_cliente` — clientes compradores

| Coluna | Significado |
|---|---|
| `id` | Identificador do cliente |
| `tipo_pessoa` | `PF` ou `PJ` |
| `razao_social` | Razão social (só PJ; NULL para PF) |
| `cidade`, `uf` | Localização do cliente |
| `faixa_etaria` | `18-29`, `30-44`, `45-59`, `60+` (só PF; NULL para PJ) |
| `data_cadastro` | Data de cadastro na rede |

### `vw_produto` — catálogo de veículos

| Coluna | Significado |
|---|---|
| `id` | Identificador do produto (versão) |
| `marca`, `modelo`, `versao` | Identificação do veículo |
| `descricao` | Descrição completa (ex.: "Toyota Corolla Cross XRE 2.0") |
| `tipo_veiculo`, `categoria`, `combustivel` | Classificação (ver domínios) |
| `ano_modelo` | Ano-modelo |
| `preco_tabela` | Preço de tabela **atual** (R$) |
| `ativo` | `1` = em linha, `0` = fora de linha |

---

## 5. Fatos

### `vw_proposta` — propostas (negociações)

Colunas: `id`, `unidade_id`, `vendedor_id`, `cliente_id`, `produto_id`, `data_proposta`,
`valor_tabela`, `valor_proposta`, `forma_pagamento`, `valor_entrada`, `qtd_parcelas`, `status`,
`data_fechamento`, `motivo_perda`. Mesmos significados de `vw_proposta_detalhada`.

### `vw_venda` — vendas (propostas ganhas e faturadas)

| Coluna | Significado |
|---|---|
| `id` | Identificador da venda |
| `proposta_id` | Proposta que originou a venda |
| `data_venda` | Data da venda |
| `valor_final` | Valor faturado (R$) |
| `data_entrega` | Data de entrega; NULL se ainda não entregue |

### `vw_meta_vendedor` — metas mensais

| Coluna | Significado |
|---|---|
| `id` | Identificador da meta |
| `vendedor_id` | Vendedor |
| `ano`, `mes` | Ano e mês (inteiros; `mes` de 1 a 12) |
| `meta_quantidade` | Meta de veículos no mês |
| `meta_valor` | Meta de receita no mês (R$) |

---

## 6. Relacionamentos

As views não declaram chaves; os JOINs corretos são estes:

| De | Para | Cardinalidade |
|---|---|---|
| `vw_vendedor.unidade_id` | `vw_unidade.id` | N:1 |
| `vw_proposta.unidade_id` | `vw_unidade.id` | N:1 |
| `vw_proposta.vendedor_id` | `vw_vendedor.id` | N:1 |
| `vw_proposta.cliente_id` | `vw_cliente.id` | N:1 |
| `vw_proposta.produto_id` | `vw_produto.id` | N:1 |
| `vw_venda.proposta_id` | `vw_proposta.id` | 1:0..1 (só propostas `GANHA` têm venda) |
| `vw_meta_vendedor.vendedor_id` | `vw_vendedor.id` | N:1 |

As visões analíticas usam os mesmos IDs (`unidade_id`, `vendedor_id`, `produto_id`,
`cliente_id`, `proposta_id`, `venda_id`) e podem ser ligadas às dimensões quando necessário.

**Vendedor → unidade**

```sql
SELECT u.nome AS unidade, v.nome AS vendedor
FROM vw_vendedor v
JOIN vw_unidade u ON u.id = v.unidade_id
LIMIT 20;
```

**Proposta → unidade**

```sql
SELECT u.nome AS unidade, COUNT(*) AS propostas
FROM vw_proposta p
JOIN vw_unidade u ON u.id = p.unidade_id
GROUP BY u.id, u.nome
LIMIT 50;
```

**Proposta → vendedor**

```sql
SELECT v.nome AS vendedor, COUNT(*) AS propostas
FROM vw_proposta p
JOIN vw_vendedor v ON v.id = p.vendedor_id
GROUP BY v.id, v.nome
ORDER BY propostas DESC
LIMIT 10;
```

**Proposta → cliente**

```sql
SELECT c.tipo_pessoa, COUNT(*) AS propostas
FROM vw_proposta p
JOIN vw_cliente c ON c.id = p.cliente_id
GROUP BY c.tipo_pessoa
LIMIT 10;
```

**Proposta → produto**

```sql
SELECT pr.categoria, COUNT(*) AS propostas
FROM vw_proposta p
JOIN vw_produto pr ON pr.id = p.produto_id
GROUP BY pr.categoria
ORDER BY propostas DESC
LIMIT 20;
```

**Venda → proposta**

```sql
SELECT p.forma_pagamento, COUNT(*) AS vendas, ROUND(SUM(v.valor_final), 2) AS receita
FROM vw_venda v
JOIN vw_proposta p ON p.id = v.proposta_id
GROUP BY p.forma_pagamento
LIMIT 10;
```

**Meta → vendedor**

```sql
SELECT v.nome AS vendedor, m.ano, m.mes, m.meta_quantidade, m.meta_valor
FROM vw_meta_vendedor m
JOIN vw_vendedor v ON v.id = m.vendedor_id
WHERE m.ano = 2026 AND m.mes = 9
LIMIT 20;
```

---

## 7. Exemplos de perguntas e SQL

**1. Qual foi a receita de vendas por mês em 2025?**

```sql
SELECT ano_mes_venda, COUNT(*) AS vendas, ROUND(SUM(valor_final), 2) AS receita
FROM vw_venda_detalhada
WHERE ano_venda = 2025
GROUP BY ano_mes_venda
ORDER BY ano_mes_venda
LIMIT 500;
```

**2. Quais foram os 5 vendedores que mais venderam SUVs no último trimestre (julho a setembro de 2026)?**

```sql
SELECT vendedor_nome, unidade_nome, COUNT(*) AS suvs_vendidos, ROUND(SUM(valor_final), 2) AS receita
FROM vw_venda_detalhada
WHERE categoria = 'SUV' AND data_venda BETWEEN '2026-07-01' AND '2026-09-30'
GROUP BY vendedor_id, vendedor_nome, unidade_nome
ORDER BY suvs_vendidos DESC, receita DESC
LIMIT 5;
```

**3. Qual a receita e o ticket médio por tipo de veículo?**

```sql
SELECT tipo_veiculo, COUNT(*) AS vendas, ROUND(SUM(valor_final), 2) AS receita,
       ROUND(AVG(valor_final), 2) AS ticket_medio
FROM vw_venda_detalhada
GROUP BY tipo_veiculo
ORDER BY receita DESC
LIMIT 500;
```

**4. Qual a taxa de conversão de cada unidade?**

```sql
SELECT unidade_nome,
       SUM(status = 'GANHA') AS ganhas,
       SUM(status <> 'EM_NEGOCIACAO') AS fechadas,
       ROUND(100.0 * SUM(status = 'GANHA') / SUM(status <> 'EM_NEGOCIACAO'), 1) AS conversao_pct
FROM vw_proposta_detalhada
GROUP BY unidade_id, unidade_nome
ORDER BY conversao_pct DESC
LIMIT 500;
```

**5. Quais os principais motivos de perda de propostas em 2025, e qual o desconto médio em cada um?**

```sql
SELECT motivo_perda, COUNT(*) AS propostas_perdidas, ROUND(AVG(desconto_percentual), 2) AS desconto_medio_pct
FROM vw_proposta_detalhada
WHERE status = 'PERDIDA' AND ano_proposta = 2025
GROUP BY motivo_perda
ORDER BY propostas_perdidas DESC
LIMIT 500;
```

**6. Quais vendedores bateram a meta de quantidade em agosto de 2026?**

```sql
SELECT vendedor_nome, unidade_nome, meta_quantidade, qtd_vendida, atingimento_quantidade_pct
FROM vw_desempenho_vendedor_mes
WHERE ano_mes = '2026-08' AND bateu_meta_quantidade = 1
ORDER BY atingimento_quantidade_pct DESC
LIMIT 500;
```

**7. Qual o percentual de vendedores que bateu a meta de valor em cada mês de 2026?**

```sql
SELECT ano_mes, COUNT(*) AS vendedores_com_meta,
       ROUND(100.0 * SUM(bateu_meta_valor) / COUNT(*), 1) AS bateram_meta_valor_pct
FROM vw_desempenho_vendedor_mes
WHERE ano = 2026
GROUP BY ano_mes
ORDER BY ano_mes
LIMIT 500;
```

**8. Quantas vendas de veículos pesados foram feitas para clientes pessoa jurídica, por UF do cliente?** (JOIN entre views por tabela)

```sql
SELECT c.uf AS cliente_uf, COUNT(*) AS vendas, ROUND(SUM(v.valor_final), 2) AS receita
FROM vw_venda v
JOIN vw_proposta p ON p.id = v.proposta_id
JOIN vw_cliente c ON c.id = p.cliente_id
JOIN vw_produto pr ON pr.id = p.produto_id
WHERE c.tipo_pessoa = 'PJ' AND pr.tipo_veiculo = 'PESADO'
GROUP BY c.uf
ORDER BY vendas DESC
LIMIT 500;
```

**9. Qual o desconto médio concedido por marca nas propostas ganhas?** (JOIN entre views por tabela)

```sql
SELECT pr.marca, COUNT(*) AS propostas_ganhas,
       ROUND(AVG(100.0 * (p.valor_tabela - p.valor_proposta) / p.valor_tabela), 2) AS desconto_medio_pct
FROM vw_proposta p
JOIN vw_produto pr ON pr.id = p.produto_id
WHERE p.status = 'GANHA'
GROUP BY pr.marca
ORDER BY desconto_medio_pct DESC
LIMIT 500;
```

**10. Quantos vendedores ativos cada unidade tem, por região?** (JOIN entre views por tabela)

```sql
SELECT u.regiao, u.nome AS unidade, COUNT(*) AS vendedores_ativos
FROM vw_vendedor v
JOIN vw_unidade u ON u.id = v.unidade_id
WHERE v.ativo = 1
GROUP BY u.regiao, u.id, u.nome
ORDER BY u.regiao, vendedores_ativos DESC
LIMIT 500;
```
