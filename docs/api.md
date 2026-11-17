# API — contrato

> Contrato da API do dashboard, seguido pela Etapa 4 (frontend). Escrito no passo 3.3 com as rotas
> de indicadores, filtros e saúde; as rotas do agente entram no passo 3.5. Os exemplos são reais
> (gerados chamando os handlers sobre o banco do seed); listas longas aparecem cortadas com
> `"… (+N)"`, que não faz parte da resposta.

## 1. Convenções gerais

| Item | Regra |
|---|---|
| Base | Mesma origem da aplicação (`/api/...`). Sem CORS: a API só atende a própria aplicação. |
| Formato | JSON (`application/json`). Campos em camelCase; valores em reais com 2 casas; percentuais de 0 a 100 com 1 casa (podem passar de 100 em atingimento de meta). `null` quando não há base de cálculo (ex.: média sem linhas, divisão por zero). |
| Métodos | Só os documentados. Qualquer outro método recebe **405** do próprio Next. |
| `x-request-id` | Toda resposta traz um UUID; o mesmo valor aparece no corpo dos erros e no log do servidor. Use-o ao relatar um problema. |
| Cache | Indicadores e filtros: `Cache-Control: private, max-age=60` (os dados não mudam durante a execução). Saúde e erros: `no-store`. |
| Cabeçalhos de segurança | Em todas as respostas: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy` restritiva e `Content-Security-Policy` (ver README, "Decisões"). Sem `X-Powered-By`. |

### 1.1 Erros

Formato único:

```json
{ "erro": { "codigo": "ENTRADA_INVALIDA", "mensagem": "texto amigável em português", "requestId": "..." } }
```

| Código | HTTP | Quando |
|---|---|---|
| `ENTRADA_INVALIDA` | 400 | Parâmetro ou corpo inválido. A mensagem cita o campo, nunca o valor enviado. |
| `CORPO_GRANDE` | 413 | Corpo de POST acima de 8 KB. |
| `TIPO_NAO_SUPORTADO` | 415 | POST sem `content-type: application/json`. |
| `LIMITE_EXCEDIDO` | 429 | Rate limit. Traz o cabeçalho `Retry-After` (segundos). |
| `OCUPADO` | 503 | Limite de execuções simultâneas do agente (passo 3.4). |
| `TEMPO_ESGOTADO` | 504 | Tempo máximo da requisição do agente (passo 3.4). |
| `ERRO_INTERNO` | 500 | Falha inesperada. Nunca traz stack, mensagem do banco ou SQL. |

Exemplo real (`GET /api/indicadores/resumo?inicio=2026-02-30` → 400):

```json
{
  "erro": {
    "codigo": "ENTRADA_INVALIDA",
    "mensagem": "Parâmetros inválidos: inicio: use uma data válida no formato AAAA-MM-DD.",
    "requestId": "20256c48-f148-4848-ac85-b8cfffea061d"
  }
}
```

### 1.2 Rate limit

Por cliente, em memória (vale para uma única instância do servidor). Sem `TRUST_PROXY=true`, todas
as requisições compartilham o mesmo limite.

| Rotas | Limite padrão (variável) |
|---|---|
| Indicadores, filtros e saúde | 120 por minuto (`RATE_LIMIT_INDICADORES_MINUTO`) |
| Agente (`perguntar` e `perguntar/stream` somados, passo 3.5) | 10 por minuto e 100 por dia (`RATE_LIMIT_AGENTE_*`) |
| Feedback (passo 3.5) | 30 por minuto (`RATE_LIMIT_FEEDBACK_MINUTO`) |

## 2. Filtros dos indicadores

Todas as rotas de indicadores aceitam os mesmos parâmetros de query string. Parâmetro desconhecido
é recusado (400). Texto vazio (`?regiao=`) conta como ausente. A resposta sempre devolve, em
`filtros`, os valores efetivamente usados (com os padrões aplicados).

| Parâmetro | Formato | Regra |
|---|---|---|
| `inicio` | `AAAA-MM-DD` | Padrão: 1º dia dos 12 meses completos que terminam no mês de `fim` (com o `fim` padrão: `2025-10-01`). |
| `fim` | `AAAA-MM-DD` | Padrão: a data de referência dos dados (`2026-09-30`). `fim ≥ inicio`; período de no máximo 36 meses. |
| `unidadeId` | inteiro positivo | Deve existir (ver `GET /api/filtros`). |
| `regiao` | `NORTE`, `NORDESTE`, `CENTRO_OESTE`, `SUDESTE`, `SUL` | |
| `tipoVeiculo` | `LEVE`, `MOTO`, `PESADO` | |
| `categoria` | ver `GET /api/filtros` | Se `tipoVeiculo` vier junto, a categoria precisa ser desse tipo. |
| `limite` | inteiro de 1 a 50 | **Só nos rankings.** Padrão 10. Nas demais rotas, é parâmetro desconhecido. |

### 2.1 Data de corte de cada indicador

| Indicadores | Data usada para o período |
|---|---|
| Receita, vendas, ticket médio, desconto (resumo, série, por região/unidade/tipo, rankings) | `data_venda` |
| Propostas criadas, conversão, em negociação, funil | `data_proposta` |
| Metas e atingimento | mês da meta (`ano_mes`), do mês de `inicio` ao mês de `fim` |

Conversão = propostas `GANHA` ÷ propostas fechadas (`GANHA` + `PERDIDA` + `CANCELADA`), entre as
propostas criadas no período. Desconto médio = média do desconto percentual das vendas.

**Unidade nas metas:** metas e atingimento usam a unidade **atual** do vendedor e ignoram
`tipoVeiculo`/`categoria` (metas não são por produto). Receita e conversão usam a unidade da venda
ou da proposta.

## 3. Rotas

### 3.1 `GET /api/indicadores/resumo`

Os números do período, os do período anterior (mesmo número de dias, terminando na véspera do
início) e a variação relativa de cada um, em % (`null` sem base de comparação).

```json
{
  "filtros": { "inicio": "2025-10-01", "fim": "2026-09-30" },
  "dados": {
    "periodo": { "inicio": "2025-10-01", "fim": "2026-09-30" },
    "periodoAnterior": { "inicio": "2024-10-01", "fim": "2025-09-30" },
    "atual": {
      "receitaTotal": 260982749.97, "qtdVendas": 1358, "ticketMedio": 192181.7, "descontoMedioPct": 5.1,
      "propostasCriadas": 4050, "conversaoPct": 34.2, "propostasEmNegociacao": 265
    },
    "anterior": {
      "receitaTotal": 246164240.7, "qtdVendas": 1299, "ticketMedio": 189502.88, "descontoMedioPct": 5.1,
      "propostasCriadas": 3950, "conversaoPct": 34.5, "propostasEmNegociacao": 0
    },
    "variacaoPct": {
      "receitaTotal": 6, "qtdVendas": 4.5, "ticketMedio": 1.4, "descontoMedioPct": 0,
      "propostasCriadas": 2.5, "conversaoPct": -0.9, "propostasEmNegociacao": null
    }
  }
}
```

### 3.2 `GET /api/indicadores/serie-mensal`

Um item por mês do período, inclusive meses sem dados (com zero).

`GET /api/indicadores/serie-mensal?inicio=2026-07-01&fim=2026-09-30`:

```json
{
  "filtros": { "inicio": "2026-07-01", "fim": "2026-09-30" },
  "dados": [
    { "anoMes": "2026-07", "receita": 19756608.45, "qtdVendas": 119, "propostas": 311, "conversaoPct": 36 },
    { "anoMes": "2026-08", "receita": 20685585.07, "qtdVendas": 123, "propostas": 344, "conversaoPct": 38.1 },
    "… (+1)"
  ]
}
```

### 3.3 `GET /api/indicadores/por-regiao`

Só as regiões com venda no recorte, por receita decrescente. `participacaoPct` é a fatia da receita
total do recorte.

```json
{
  "filtros": { "inicio": "2025-10-01", "fim": "2026-09-30" },
  "dados": [
    { "regiao": "SUDESTE", "receita": 139160781.75, "qtdVendas": 722, "ticketMedio": 192743.47, "participacaoPct": 53.3 },
    { "regiao": "SUL", "receita": 59922562.92, "qtdVendas": 189, "ticketMedio": 317050.6, "participacaoPct": 23 },
    "… (+3)"
  ]
}
```

### 3.4 `GET /api/indicadores/por-unidade`

Todas as unidades que atendem a `unidadeId`/`regiao`, inclusive as sem venda (com zero), por receita
decrescente. Atingimento médio de meta em quantidade e em valor.

`GET /api/indicadores/por-unidade?regiao=SUL`:

```json
{
  "filtros": { "regiao": "SUL", "inicio": "2025-10-01", "fim": "2026-09-30" },
  "dados": [
    {
      "unidadeId": 7, "unidade": "AutoRede Porto Alegre", "regiao": "SUL", "receita": 31604764.98, "qtdVendas": 94,
      "conversaoPct": 32.2, "atingimentoQtdPct": 84.1, "atingimentoValorPct": 99.2
    },
    {
      "unidadeId": 6, "unidade": "AutoRede Curitiba", "regiao": "SUL", "receita": 28317797.94, "qtdVendas": 95,
      "conversaoPct": 38.2, "atingimentoQtdPct": 79.1, "atingimentoValorPct": 86.7
    }
  ]
}
```

### 3.5 `GET /api/indicadores/por-tipo-veiculo`

Por tipo e por categoria, com participação na receita total do recorte. Só o que teve venda.

```json
{
  "filtros": { "inicio": "2025-10-01", "fim": "2026-09-30" },
  "dados": {
    "porTipo": [
      { "tipoVeiculo": "LEVE", "receita": 150664558.56, "qtdVendas": 952, "ticketMedio": 158261.09, "participacaoPct": 57.7 },
      { "tipoVeiculo": "PESADO", "receita": 102135899.9, "qtdVendas": 122, "ticketMedio": 837179.51, "participacaoPct": 39.1 },
      "… (+1)"
    ],
    "porCategoria": [
      { "tipoVeiculo": "PESADO", "categoria": "CAMINHAO", "receita": 61680913.99, "qtdVendas": 83, "ticketMedio": 743143.54, "participacaoPct": 23.6 },
      { "tipoVeiculo": "LEVE", "categoria": "SUV", "receita": 57750017.51, "qtdVendas": 306, "ticketMedio": 188725.55, "participacaoPct": 22.1 },
      "… (+10)"
    ]
  }
}
```

### 3.6 `GET /api/indicadores/ranking-vendedores`

Top N por receita (`limite`, padrão 10, máximo 50). Desempate: quantidade de vendas, depois o id. A
unidade exibida é a atual do vendedor; os filtros de unidade/região valem para a unidade da venda.

`GET /api/indicadores/ranking-vendedores?limite=3`:

```json
{
  "filtros": { "inicio": "2025-10-01", "fim": "2026-09-30" },
  "limite": 3,
  "dados": [
    {
      "posicao": 1, "vendedorId": 2, "vendedor": "Ana Júlia Barros", "unidadeId": 1, "unidade": "AutoRede São Paulo",
      "receita": 17698874.21, "qtdVendas": 55, "ticketMedio": 321797.71, "descontoMedioPct": 5.1, "conversaoPct": 42.6
    },
    {
      "posicao": 2, "vendedorId": 7, "vendedor": "Marcela Xavier", "unidadeId": 2, "unidade": "AutoRede Campinas",
      "receita": 14087661.17, "qtdVendas": 74, "ticketMedio": 190373.8, "descontoMedioPct": 5.1, "conversaoPct": 44.7
    },
    "… (+1)"
  ]
}
```

### 3.7 `GET /api/indicadores/ranking-produtos`

Duas listas, top N por quantidade vendida e top N por receita (o mesmo `limite` corta as duas).

`GET /api/indicadores/ranking-produtos?limite=2&tipoVeiculo=MOTO`:

```json
{
  "filtros": { "tipoVeiculo": "MOTO", "inicio": "2025-10-01", "fim": "2026-09-30" },
  "limite": 2,
  "dados": {
    "porQuantidade": [
      { "posicao": 1, "produtoId": 39, "marca": "Honda", "modelo": "CG 160", "versao": "Titan", "tipoVeiculo": "MOTO", "categoria": "STREET", "qtdVendas": 36, "receita": 586763.94 },
      { "posicao": 2, "produtoId": 48, "marca": "Yamaha", "modelo": "NMax 160", "versao": "Connected", "tipoVeiculo": "MOTO", "categoria": "SCOOTER", "qtdVendas": 30, "receita": 617130.63 }
    ],
    "porReceita": [
      { "posicao": 1, "produtoId": 52, "marca": "BMW Motorrad", "modelo": "R 1300 GS", "versao": "Standard", "tipoVeiculo": "MOTO", "categoria": "TRAIL", "qtdVendas": 13, "receita": 1398298.3 },
      { "posicao": 2, "produtoId": 50, "marca": "Kawasaki", "modelo": "Ninja 400", "versao": "Standard", "tipoVeiculo": "MOTO", "categoria": "ESPORTIVA", "qtdVendas": 20, "receita": 732571.58 }
    ]
  }
}
```

### 3.8 `GET /api/indicadores/funil`

Propostas criadas no período por status (os 4 sempre presentes), conversão, motivos de perda (em %
das perdidas, por quantidade decrescente) e tempo médio até o fechamento, em dias.

```json
{
  "filtros": { "inicio": "2025-10-01", "fim": "2026-09-30" },
  "dados": {
    "total": 4050,
    "porStatus": [
      { "status": "EM_NEGOCIACAO", "quantidade": 265, "pct": 6.5 },
      { "status": "GANHA", "quantidade": 1293, "pct": 31.9 },
      "… (+2)"
    ],
    "conversaoPct": 34.2,
    "motivosPerda": [
      { "motivo": "PRECO", "quantidade": 778, "pct": 36.9 },
      { "motivo": "DESISTENCIA", "quantidade": 453, "pct": 21.5 },
      "… (+3)"
    ],
    "tempoMedioFechamentoDias": 15.4
  }
}
```

### 3.9 `GET /api/indicadores/metas`

Resumo por mês e o detalhe por vendedor do mês mais recente do período que tem metas
(`mesMaisRecente` é `null` se não houver metas no período). Vendedores por atingimento de valor
decrescente.

`GET /api/indicadores/metas?inicio=2026-08-01&fim=2026-09-30&unidadeId=1`:

```json
{
  "filtros": { "inicio": "2026-08-01", "fim": "2026-09-30", "unidadeId": 1 },
  "dados": {
    "porMes": [
      { "anoMes": "2026-08", "vendedoresComMeta": 4, "bateramQuantidade": 1, "bateramValor": 1, "atingimentoQtdPct": 116.3, "atingimentoValorPct": 110.2 },
      { "anoMes": "2026-09", "vendedoresComMeta": 4, "bateramQuantidade": 2, "bateramValor": 2, "atingimentoQtdPct": 117.5, "atingimentoValorPct": 159.1 }
    ],
    "mesMaisRecente": {
      "anoMes": "2026-09",
      "vendedores": [
        {
          "vendedorId": 2, "vendedor": "Ana Júlia Barros", "unidadeId": 1, "unidade": "AutoRede São Paulo",
          "metaQuantidade": 4, "qtdVendida": 6, "atingimentoQtdPct": 150, "bateuQuantidade": true,
          "metaValor": 874316.71, "valorVendido": 3337302.79, "atingimentoValorPct": 381.7, "bateuValor": true
        },
        "… (+3)"
      ]
    }
  }
}
```

### 3.10 `GET /api/filtros`

Opções dos seletores. **Não aceita parâmetros** (qualquer um → 400). Unidades por nome; regiões só
as que têm unidade; tipos com suas categorias; e o período com dados (primeira e última data entre
propostas e vendas).

```json
{
  "unidades": [
    { "id": 4, "nome": "AutoRede Belo Horizonte", "regiao": "SUDESTE", "ativa": true },
    { "id": 11, "nome": "AutoRede Brasília", "regiao": "CENTRO_OESTE", "ativa": true },
    "… (+10)"
  ],
  "regioes": ["NORTE", "NORDESTE", "… (+3)"],
  "tipos": [
    { "tipoVeiculo": "LEVE", "categorias": ["HATCH", "SEDAN", "SUV", "PICAPE", "UTILITARIO"] },
    { "tipoVeiculo": "MOTO", "categorias": ["STREET", "TRAIL", "SCOOTER", "ESPORTIVA", "CUSTOM"] },
    { "tipoVeiculo": "PESADO", "categorias": ["CAMINHAO", "ONIBUS"] }
  ],
  "periodoDisponivel": { "inicio": "2024-10-01", "fim": "2026-09-30" }
}
```

### 3.11 `GET /api/health`

Saúde do serviço. Só estes 4 campos (sem versões, caminhos nem variáveis). `503` com
`"status": "erro"` e `"banco": "erro"` se o banco não responder. `agente`: modo do agente
(`real`/`fake`); `langsmith`: rastreamento ligado e configurado.

```json
{ "status": "ok", "banco": "ok", "agente": "real", "langsmith": true }
```

### 3.12 Agente (passo 3.5)

`POST /api/agente/perguntar`, `POST /api/agente/perguntar/stream` e `POST /api/agente/feedback`:
contrato a documentar no passo 3.5 (PRD da Etapa 3, seção 7.2).
