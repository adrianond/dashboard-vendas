-- faixa_etaria calculada na data de referência dos dados (2026-09-30), não na data atual.
-- Com 'now', a mesma pergunta sobre faixa etária mudava de resposta com o passar do tempo. Uma
-- view não lê o .env: a data é literal e deve acompanhar DATA_REFERENCIA (tests/db.views.test.ts
-- confere). Mudar a DATA_REFERENCIA exige uma migration nova. As views são idênticas às da 0001,
-- exceto 'now' → '2026-09-30' na expressão da idade.

DROP VIEW vw_cliente;
--> statement-breakpoint
CREATE VIEW vw_cliente AS
SELECT
  id,
  tipo_pessoa,
  CASE WHEN tipo_pessoa = 'PJ' THEN nome END AS razao_social,
  cidade,
  uf,
  CASE
    WHEN tipo_pessoa <> 'PF' OR data_nascimento IS NULL THEN NULL
    WHEN (CAST(strftime('%Y','2026-09-30') AS INTEGER) - CAST(strftime('%Y', data_nascimento) AS INTEGER)
          - (strftime('%m-%d','2026-09-30') < strftime('%m-%d', data_nascimento))) < 30 THEN '18-29'
    WHEN (CAST(strftime('%Y','2026-09-30') AS INTEGER) - CAST(strftime('%Y', data_nascimento) AS INTEGER)
          - (strftime('%m-%d','2026-09-30') < strftime('%m-%d', data_nascimento))) < 45 THEN '30-44'
    WHEN (CAST(strftime('%Y','2026-09-30') AS INTEGER) - CAST(strftime('%Y', data_nascimento) AS INTEGER)
          - (strftime('%m-%d','2026-09-30') < strftime('%m-%d', data_nascimento))) < 60 THEN '45-59'
    ELSE '60+'
  END AS faixa_etaria,
  data_cadastro
FROM cliente;
--> statement-breakpoint
DROP VIEW vw_venda_detalhada;
--> statement-breakpoint
CREATE VIEW vw_venda_detalhada AS
SELECT
  v.id AS venda_id,
  v.proposta_id,
  v.data_venda,
  CAST(strftime('%Y', v.data_venda) AS INTEGER) AS ano_venda,
  CAST(strftime('%m', v.data_venda) AS INTEGER) AS mes_venda,
  strftime('%Y-%m', v.data_venda) AS ano_mes_venda,
  v.valor_final,
  v.data_entrega,
  CAST(julianday(v.data_entrega) - julianday(v.data_venda) AS INTEGER) AS dias_para_entrega,
  p.data_proposta,
  CAST(julianday(v.data_venda) - julianday(p.data_proposta) AS INTEGER) AS dias_para_fechamento,
  p.valor_tabela,
  p.valor_proposta,
  ROUND(p.valor_tabela - p.valor_proposta, 2) AS desconto,
  ROUND((p.valor_tabela - p.valor_proposta) * 100.0 / p.valor_tabela, 2) AS desconto_percentual,
  p.forma_pagamento,
  p.valor_entrada,
  p.qtd_parcelas,
  u.id AS unidade_id, u.nome AS unidade_nome, u.cidade AS unidade_cidade, u.uf AS unidade_uf, u.regiao AS unidade_regiao,
  ve.id AS vendedor_id, ve.nome AS vendedor_nome, ve.ativo AS vendedor_ativo,
  pr.id AS produto_id, pr.marca, pr.modelo, pr.versao, pr.descricao AS produto_descricao,
  pr.tipo_veiculo, pr.categoria, pr.combustivel, pr.ano_modelo,
  c.id AS cliente_id,
  c.tipo_pessoa AS cliente_tipo_pessoa,
  CASE WHEN c.tipo_pessoa = 'PJ' THEN c.nome END AS cliente_razao_social,
  c.cidade AS cliente_cidade,
  c.uf AS cliente_uf,
  CASE
    WHEN c.tipo_pessoa <> 'PF' OR c.data_nascimento IS NULL THEN NULL
    WHEN (CAST(strftime('%Y','2026-09-30') AS INTEGER) - CAST(strftime('%Y', c.data_nascimento) AS INTEGER)
          - (strftime('%m-%d','2026-09-30') < strftime('%m-%d', c.data_nascimento))) < 30 THEN '18-29'
    WHEN (CAST(strftime('%Y','2026-09-30') AS INTEGER) - CAST(strftime('%Y', c.data_nascimento) AS INTEGER)
          - (strftime('%m-%d','2026-09-30') < strftime('%m-%d', c.data_nascimento))) < 45 THEN '30-44'
    WHEN (CAST(strftime('%Y','2026-09-30') AS INTEGER) - CAST(strftime('%Y', c.data_nascimento) AS INTEGER)
          - (strftime('%m-%d','2026-09-30') < strftime('%m-%d', c.data_nascimento))) < 60 THEN '45-59'
    ELSE '60+'
  END AS cliente_faixa_etaria
FROM venda v
JOIN proposta p ON p.id = v.proposta_id
JOIN unidade u ON u.id = p.unidade_id
JOIN vendedor ve ON ve.id = p.vendedor_id
JOIN produto pr ON pr.id = p.produto_id
JOIN cliente c ON c.id = p.cliente_id;
--> statement-breakpoint
DROP VIEW vw_proposta_detalhada;
--> statement-breakpoint
CREATE VIEW vw_proposta_detalhada AS
SELECT
  p.id AS proposta_id,
  p.data_proposta,
  CAST(strftime('%Y', p.data_proposta) AS INTEGER) AS ano_proposta,
  CAST(strftime('%m', p.data_proposta) AS INTEGER) AS mes_proposta,
  strftime('%Y-%m', p.data_proposta) AS ano_mes_proposta,
  p.status,
  p.data_fechamento,
  CAST(julianday(p.data_fechamento) - julianday(p.data_proposta) AS INTEGER) AS dias_ate_fechamento,
  p.motivo_perda,
  p.valor_tabela,
  p.valor_proposta,
  ROUND(p.valor_tabela - p.valor_proposta, 2) AS desconto,
  ROUND((p.valor_tabela - p.valor_proposta) * 100.0 / p.valor_tabela, 2) AS desconto_percentual,
  p.forma_pagamento,
  p.valor_entrada,
  p.qtd_parcelas,
  CASE WHEN v.id IS NULL THEN 0 ELSE 1 END AS foi_vendida,
  v.id AS venda_id,
  v.data_venda,
  v.valor_final,
  u.id AS unidade_id, u.nome AS unidade_nome, u.cidade AS unidade_cidade, u.uf AS unidade_uf, u.regiao AS unidade_regiao,
  ve.id AS vendedor_id, ve.nome AS vendedor_nome, ve.ativo AS vendedor_ativo,
  pr.id AS produto_id, pr.marca, pr.modelo, pr.versao, pr.descricao AS produto_descricao,
  pr.tipo_veiculo, pr.categoria, pr.combustivel, pr.ano_modelo,
  c.id AS cliente_id,
  c.tipo_pessoa AS cliente_tipo_pessoa,
  CASE WHEN c.tipo_pessoa = 'PJ' THEN c.nome END AS cliente_razao_social,
  c.cidade AS cliente_cidade,
  c.uf AS cliente_uf,
  CASE
    WHEN c.tipo_pessoa <> 'PF' OR c.data_nascimento IS NULL THEN NULL
    WHEN (CAST(strftime('%Y','2026-09-30') AS INTEGER) - CAST(strftime('%Y', c.data_nascimento) AS INTEGER)
          - (strftime('%m-%d','2026-09-30') < strftime('%m-%d', c.data_nascimento))) < 30 THEN '18-29'
    WHEN (CAST(strftime('%Y','2026-09-30') AS INTEGER) - CAST(strftime('%Y', c.data_nascimento) AS INTEGER)
          - (strftime('%m-%d','2026-09-30') < strftime('%m-%d', c.data_nascimento))) < 45 THEN '30-44'
    WHEN (CAST(strftime('%Y','2026-09-30') AS INTEGER) - CAST(strftime('%Y', c.data_nascimento) AS INTEGER)
          - (strftime('%m-%d','2026-09-30') < strftime('%m-%d', c.data_nascimento))) < 60 THEN '45-59'
    ELSE '60+'
  END AS cliente_faixa_etaria
FROM proposta p
LEFT JOIN venda v ON v.proposta_id = p.id
JOIN unidade u ON u.id = p.unidade_id
JOIN vendedor ve ON ve.id = p.vendedor_id
JOIN produto pr ON pr.id = p.produto_id
JOIN cliente c ON c.id = p.cliente_id;
