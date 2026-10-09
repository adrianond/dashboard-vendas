import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// Convenções (CLAUDE.md, seção 6): nomes em português/snake_case/singular, datas TEXT ISO
// (YYYY-MM-DD), valores em REAL (R$), domínios fechados em TEXT maiúsculo com CHECK.
// Os CHECKs usam nomes de coluna literais para o SQL gerado ficar legível.

export const unidade = sqliteTable(
  "unidade",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    nome: text().notNull().unique(),
    cnpj: text().notNull().unique(),
    logradouro: text().notNull(),
    numero: text().notNull(),
    bairro: text().notNull(),
    cidade: text().notNull(),
    uf: text().notNull(),
    regiao: text().notNull(),
    cep: text().notNull(),
    telefone: text().notNull(),
    email: text().notNull(),
    data_inauguracao: text().notNull(),
    ativo: integer().notNull().default(1),
  },
  () => [
    check("unidade_uf_ck", sql`length(uf) = 2`),
    check("unidade_regiao_ck", sql`regiao IN ('NORTE','NORDESTE','CENTRO_OESTE','SUDESTE','SUL')`),
    check("unidade_ativo_ck", sql`ativo IN (0, 1)`),
  ],
);

export const vendedor = sqliteTable(
  "vendedor",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    unidade_id: integer().notNull().references(() => unidade.id),
    nome: text().notNull(),
    cpf: text().notNull().unique(),
    email: text().notNull().unique(),
    telefone: text().notNull(),
    data_admissao: text().notNull(),
    data_desligamento: text(),
    ativo: integer().notNull(),
  },
  (t) => [
    index("vendedor_unidade_id_idx").on(t.unidade_id),
    check("vendedor_ativo_ck", sql`ativo IN (0, 1)`),
  ],
);

export const cliente = sqliteTable(
  "cliente",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    tipo_pessoa: text().notNull(),
    nome: text().notNull(),
    documento: text().notNull().unique(),
    email: text(),
    telefone: text().notNull(),
    cidade: text().notNull(),
    uf: text().notNull(),
    data_nascimento: text(),
    data_cadastro: text().notNull(),
  },
  () => [
    check("cliente_tipo_pessoa_ck", sql`tipo_pessoa IN ('PF','PJ')`),
    check("cliente_data_nascimento_ck", sql`tipo_pessoa = 'PF' OR data_nascimento IS NULL`),
  ],
);

export const produto = sqliteTable(
  "produto",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    marca: text().notNull(),
    modelo: text().notNull(),
    versao: text().notNull(),
    descricao: text().notNull(),
    tipo_veiculo: text().notNull(),
    categoria: text().notNull(),
    combustivel: text().notNull(),
    ano_modelo: integer().notNull(),
    preco_tabela: real().notNull(),
    ativo: integer().notNull(),
  },
  (t) => [
    unique("produto_marca_modelo_versao_ano_uq").on(t.marca, t.modelo, t.versao, t.ano_modelo),
    check("produto_tipo_veiculo_ck", sql`tipo_veiculo IN ('LEVE','MOTO','PESADO')`),
    check(
      "produto_categoria_ck",
      sql`(tipo_veiculo = 'LEVE' AND categoria IN ('HATCH','SEDAN','SUV','PICAPE','UTILITARIO'))
       OR (tipo_veiculo = 'MOTO' AND categoria IN ('STREET','TRAIL','SCOOTER','ESPORTIVA','CUSTOM'))
       OR (tipo_veiculo = 'PESADO' AND categoria IN ('CAMINHAO','ONIBUS'))`,
    ),
    check("produto_combustivel_ck", sql`combustivel IN ('FLEX','GASOLINA','DIESEL','HIBRIDO','ELETRICO')`),
    check("produto_preco_tabela_ck", sql`preco_tabela > 0`),
    check("produto_ativo_ck", sql`ativo IN (0, 1)`),
  ],
);

export const proposta = sqliteTable(
  "proposta",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    // Unidade no momento da proposta (snapshot): preserva o histórico se o vendedor for transferido.
    unidade_id: integer().notNull().references(() => unidade.id),
    vendedor_id: integer().notNull().references(() => vendedor.id),
    cliente_id: integer().notNull().references(() => cliente.id),
    produto_id: integer().notNull().references(() => produto.id),
    data_proposta: text().notNull(),
    // Preço de tabela na data da proposta (snapshot).
    valor_tabela: real().notNull(),
    valor_proposta: real().notNull(),
    forma_pagamento: text().notNull(),
    valor_entrada: real(),
    qtd_parcelas: integer(),
    status: text().notNull(),
    data_fechamento: text(),
    motivo_perda: text(),
    observacao: text(),
  },
  (t) => [
    index("proposta_data_proposta_idx").on(t.data_proposta),
    index("proposta_status_idx").on(t.status),
    index("proposta_unidade_id_idx").on(t.unidade_id),
    index("proposta_vendedor_id_idx").on(t.vendedor_id),
    index("proposta_produto_id_idx").on(t.produto_id),
    index("proposta_cliente_id_idx").on(t.cliente_id),
    check("proposta_valor_proposta_ck", sql`valor_proposta > 0`),
    check("proposta_forma_pagamento_ck", sql`forma_pagamento IN ('A_VISTA','FINANCIAMENTO','CONSORCIO','LEASING')`),
    check("proposta_valor_entrada_ck", sql`forma_pagamento <> 'FINANCIAMENTO' OR valor_entrada IS NOT NULL`),
    check("proposta_qtd_parcelas_ck", sql`forma_pagamento = 'A_VISTA' OR qtd_parcelas IS NOT NULL`),
    check("proposta_status_ck", sql`status IN ('EM_NEGOCIACAO','GANHA','PERDIDA','CANCELADA')`),
    check("proposta_data_fechamento_ck", sql`status = 'EM_NEGOCIACAO' OR data_fechamento IS NOT NULL`),
    check(
      "proposta_motivo_perda_ck",
      sql`motivo_perda IS NULL OR motivo_perda IN ('PRECO','CREDITO_NEGADO','DESISTENCIA','CONCORRENCIA','PRAZO_ENTREGA')`,
    ),
    check("proposta_motivo_perda_obrigatorio_ck", sql`status <> 'PERDIDA' OR motivo_perda IS NOT NULL`),
  ],
);

export const venda = sqliteTable(
  "venda",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    proposta_id: integer().notNull().unique().references(() => proposta.id),
    data_venda: text().notNull(),
    valor_final: real().notNull(),
    numero_nota_fiscal: text().notNull().unique(),
    data_entrega: text(),
  },
  (t) => [
    index("venda_data_venda_idx").on(t.data_venda),
    check("venda_valor_final_ck", sql`valor_final > 0`),
    check("venda_data_entrega_ck", sql`data_entrega IS NULL OR data_entrega >= data_venda`),
  ],
);

export const meta_vendedor = sqliteTable(
  "meta_vendedor",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    vendedor_id: integer().notNull().references(() => vendedor.id),
    ano: integer().notNull(),
    mes: integer().notNull(),
    meta_quantidade: integer().notNull(),
    meta_valor: real().notNull(),
  },
  (t) => [
    unique("meta_vendedor_vendedor_ano_mes_uq").on(t.vendedor_id, t.ano, t.mes),
    check("meta_vendedor_mes_ck", sql`mes BETWEEN 1 AND 12`),
    check("meta_vendedor_meta_quantidade_ck", sql`meta_quantidade > 0`),
    check("meta_vendedor_meta_valor_ck", sql`meta_valor > 0`),
  ],
);
