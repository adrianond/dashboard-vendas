-- Views para o LLM (seção 6.5 do PRD). Todas sobre tabelas base, sem dados pessoais nem texto livre.

-- ===== Dimensões =====
CREATE VIEW vw_unidade AS
SELECT id, nome, cidade, uf, regiao, data_inauguracao, ativo
FROM unidade;
--> statement-breakpoint
CREATE VIEW vw_vendedor AS
SELECT id, unidade_id, nome, data_admissao, data_desligamento, ativo
FROM vendedor;
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
    WHEN (CAST(strftime('%Y','now') AS INTEGER) - CAST(strftime('%Y', data_nascimento) AS INTEGER)
          - (strftime('%m-%d','now') < strftime('%m-%d', data_nascimento))) < 30 THEN '18-29'
    WHEN (CAST(strftime('%Y','now') AS INTEGER) - CAST(strftime('%Y', data_nascimento) AS INTEGER)
          - (strftime('%m-%d','now') < strftime('%m-%d', data_nascimento))) < 45 THEN '30-44'
    WHEN (CAST(strftime('%Y','now') AS INTEGER) - CAST(strftime('%Y', data_nascimento) AS INTEGER)
          - (strftime('%m-%d','now') < strftime('%m-%d', data_nascimento))) < 60 THEN '45-59'
    ELSE '60+'
  END AS faixa_etaria,
  data_cadastro
FROM cliente;
--> statement-breakpoint
CREATE VIEW vw_produto AS
SELECT id, marca, modelo, versao, descricao, tipo_veiculo, categoria, combustivel, ano_modelo, preco_tabela, ativo
FROM produto;
--> statement-breakpoint

-- ===== Fatos =====
CREATE VIEW vw_proposta AS
SELECT id, unidade_id, vendedor_id, cliente_id, produto_id, data_proposta, valor_tabela, valor_proposta,
       forma_pagamento, valor_entrada, qtd_parcelas, status, data_fechamento, motivo_perda
FROM proposta;
--> statement-breakpoint
CREATE VIEW vw_venda AS
SELECT id, proposta_id, data_venda, valor_final, data_entrega
FROM venda;
--> statement-breakpoint
CREATE VIEW vw_meta_vendedor AS
SELECT id, vendedor_id, ano, mes, meta_quantidade, meta_valor
FROM meta_vendedor;
--> statement-breakpoint

-- ===== Visões analíticas =====
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
    WHEN (CAST(strftime('%Y','now') AS INTEGER) - CAST(strftime('%Y', c.data_nascimento) AS INTEGER)
          - (strftime('%m-%d','now') < strftime('%m-%d', c.data_nascimento))) < 30 THEN '18-29'
    WHEN (CAST(strftime('%Y','now') AS INTEGER) - CAST(strftime('%Y', c.data_nascimento) AS INTEGER)
          - (strftime('%m-%d','now') < strftime('%m-%d', c.data_nascimento))) < 45 THEN '30-44'
    WHEN (CAST(strftime('%Y','now') AS INTEGER) - CAST(strftime('%Y', c.data_nascimento) AS INTEGER)
          - (strftime('%m-%d','now') < strftime('%m-%d', c.data_nascimento))) < 60 THEN '45-59'
    ELSE '60+'
  END AS cliente_faixa_etaria
FROM venda v
JOIN proposta p ON p.id = v.proposta_id
JOIN unidade u ON u.id = p.unidade_id
JOIN vendedor ve ON ve.id = p.vendedor_id
JOIN produto pr ON pr.id = p.produto_id
JOIN cliente c ON c.id = p.cliente_id;
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
    WHEN (CAST(strftime('%Y','now') AS INTEGER) - CAST(strftime('%Y', c.data_nascimento) AS INTEGER)
          - (strftime('%m-%d','now') < strftime('%m-%d', c.data_nascimento))) < 30 THEN '18-29'
    WHEN (CAST(strftime('%Y','now') AS INTEGER) - CAST(strftime('%Y', c.data_nascimento) AS INTEGER)
          - (strftime('%m-%d','now') < strftime('%m-%d', c.data_nascimento))) < 45 THEN '30-44'
    WHEN (CAST(strftime('%Y','now') AS INTEGER) - CAST(strftime('%Y', c.data_nascimento) AS INTEGER)
          - (strftime('%m-%d','now') < strftime('%m-%d', c.data_nascimento))) < 60 THEN '45-59'
    ELSE '60+'
  END AS cliente_faixa_etaria
FROM proposta p
LEFT JOIN venda v ON v.proposta_id = p.id
JOIN unidade u ON u.id = p.unidade_id
JOIN vendedor ve ON ve.id = p.vendedor_id
JOIN produto pr ON pr.id = p.produto_id
JOIN cliente c ON c.id = p.cliente_id;
--> statement-breakpoint
-- Única view com agregação; o realizado é calculado pela data_venda dentro do mês da meta.
-- Meses sem venda aparecem com qtd_vendida = 0 e valor_vendido = 0 (LEFT JOIN).
CREATE VIEW vw_desempenho_vendedor_mes AS
SELECT
  m.vendedor_id,
  ve.nome AS vendedor_nome,
  ve.unidade_id,
  u.nome AS unidade_nome,
  m.ano,
  m.mes,
  printf('%04d-%02d', m.ano, m.mes) AS ano_mes,
  m.meta_quantidade,
  m.meta_valor,
  COUNT(v.id) AS qtd_vendida,
  ROUND(COALESCE(SUM(v.valor_final), 0), 2) AS valor_vendido,
  ROUND(COUNT(v.id) * 100.0 / m.meta_quantidade, 2) AS atingimento_quantidade_pct,
  ROUND(COALESCE(SUM(v.valor_final), 0) * 100.0 / m.meta_valor, 2) AS atingimento_valor_pct,
  CASE WHEN COUNT(v.id) >= m.meta_quantidade THEN 1 ELSE 0 END AS bateu_meta_quantidade,
  CASE WHEN COALESCE(SUM(v.valor_final), 0) >= m.meta_valor THEN 1 ELSE 0 END AS bateu_meta_valor
FROM meta_vendedor m
JOIN vendedor ve ON ve.id = m.vendedor_id
JOIN unidade u ON u.id = ve.unidade_id
LEFT JOIN (venda v JOIN proposta p ON p.id = v.proposta_id)
  ON p.vendedor_id = m.vendedor_id
 AND v.data_venda >= printf('%04d-%02d-01', m.ano, m.mes)
 AND v.data_venda <  date(printf('%04d-%02d-01', m.ano, m.mes), '+1 month')
GROUP BY m.id;
