import type Database from "better-sqlite3";

// Regras de integridade dos dados (PRD, critério de aceite 5). Cada SQL devolve as linhas que
// VIOLAM a regra: nenhuma linha = regra respeitada. As funções recebem a conexão como parâmetro;
// o db:check usa a conexão somente leitura.

export type Regra = { regra: string; sql: string };
export type ResultadoRegra = { regra: string; violacoes: number; exemplos: unknown[] };

const MAX_EXEMPLOS = 3;

export const REGRAS: Regra[] = [
  {
    regra: "PRAGMA foreign_key_check vazio",
    sql: "SELECT * FROM pragma_foreign_key_check()",
  },
  {
    regra: "toda proposta GANHA tem exatamente uma venda",
    sql: `SELECT p.id AS proposta_id, count(v.id) AS vendas
          FROM proposta p LEFT JOIN venda v ON v.proposta_id = p.id
          WHERE p.status = 'GANHA'
          GROUP BY p.id HAVING count(v.id) <> 1`,
  },
  {
    regra: "nenhuma proposta que não é GANHA tem venda",
    sql: `SELECT p.id AS proposta_id, p.status, v.id AS venda_id
          FROM proposta p JOIN venda v ON v.proposta_id = p.id
          WHERE p.status <> 'GANHA'`,
  },
  {
    regra: "proposta.unidade_id igual à unidade do vendedor",
    sql: `SELECT p.id AS proposta_id, p.unidade_id, ve.unidade_id AS unidade_do_vendedor
          FROM proposta p JOIN vendedor ve ON ve.id = p.vendedor_id
          WHERE p.unidade_id <> ve.unidade_id`,
  },
  {
    regra: "data_proposta dentro do período ativo do vendedor",
    sql: `SELECT p.id AS proposta_id, p.data_proposta, ve.data_admissao, ve.data_desligamento
          FROM proposta p JOIN vendedor ve ON ve.id = p.vendedor_id
          WHERE p.data_proposta < ve.data_admissao
             OR (ve.data_desligamento IS NOT NULL AND p.data_proposta > ve.data_desligamento)`,
  },
  {
    regra: "data_fechamento preenchida quando status ≠ EM_NEGOCIACAO",
    sql: `SELECT id AS proposta_id, status FROM proposta
          WHERE status <> 'EM_NEGOCIACAO' AND data_fechamento IS NULL`,
  },
  {
    regra: "motivo_perda preenchido quando PERDIDA",
    sql: `SELECT id AS proposta_id FROM proposta WHERE status = 'PERDIDA' AND motivo_perda IS NULL`,
  },
  {
    regra: "data_venda ≥ data_proposta",
    sql: `SELECT v.id AS venda_id, p.data_proposta, v.data_venda
          FROM venda v JOIN proposta p ON p.id = v.proposta_id
          WHERE v.data_venda < p.data_proposta`,
  },
  {
    regra: "data_entrega ≥ data_venda",
    sql: `SELECT id AS venda_id, data_venda, data_entrega FROM venda
          WHERE data_entrega IS NOT NULL AND data_entrega < data_venda`,
  },
  {
    regra: "valor_proposta ≤ valor_tabela",
    sql: `SELECT id AS proposta_id, valor_tabela, valor_proposta FROM proposta
          WHERE valor_proposta > valor_tabela`,
  },
  {
    regra: "categoria coerente com tipo_veiculo",
    sql: `SELECT id AS produto_id, tipo_veiculo, categoria FROM produto
          WHERE NOT (
               (tipo_veiculo = 'LEVE' AND categoria IN ('HATCH','SEDAN','SUV','PICAPE','UTILITARIO'))
            OR (tipo_veiculo = 'MOTO' AND categoria IN ('STREET','TRAIL','SCOOTER','ESPORTIVA','CUSTOM'))
            OR (tipo_veiculo = 'PESADO' AND categoria IN ('CAMINHAO','ONIBUS')))`,
  },
  {
    regra: "combustivel coerente com tipo_veiculo",
    sql: `SELECT id AS produto_id, tipo_veiculo, categoria, combustivel FROM produto
          WHERE (tipo_veiculo = 'MOTO' AND combustivel NOT IN ('GASOLINA','FLEX','ELETRICO'))
             OR (tipo_veiculo = 'PESADO' AND NOT (combustivel = 'DIESEL'
                   OR (combustivel = 'ELETRICO' AND categoria = 'ONIBUS')))`,
  },
  {
    regra: "os três tipos de veículo têm propostas e vendas",
    sql: `SELECT tipo, propostas, vendas FROM (
            SELECT t.tipo,
              (SELECT count(*) FROM proposta p JOIN produto pr ON pr.id = p.produto_id
                WHERE pr.tipo_veiculo = t.tipo) AS propostas,
              (SELECT count(*) FROM venda v JOIN proposta p ON p.id = v.proposta_id
                JOIN produto pr ON pr.id = p.produto_id WHERE pr.tipo_veiculo = t.tipo) AS vendas
            FROM (SELECT 'LEVE' AS tipo UNION ALL SELECT 'MOTO' UNION ALL SELECT 'PESADO') t)
          WHERE propostas = 0 OR vendas = 0`,
  },
];

export function verificarIntegridade(conexao: Database.Database): ResultadoRegra[] {
  return REGRAS.map(({ regra, sql }) => {
    const linhas = conexao.prepare(sql).all();
    return { regra, violacoes: linhas.length, exemplos: linhas.slice(0, MAX_EXEMPLOS) };
  });
}

const TABELAS = ["unidade", "vendedor", "cliente", "produto", "proposta", "venda", "meta_vendedor"];

export function resumirBanco(conexao: Database.Database) {
  const contagens = Object.fromEntries(
    TABELAS.map((t) => [t, (conexao.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n]),
  );

  // Taxa de conversão = propostas GANHA / propostas fechadas (GANHA + PERDIDA + CANCELADA).
  const indicadores = conexao
    .prepare(
      `SELECT
         (SELECT round(sum(valor_final), 2) FROM venda) AS receita_total,
         round(100.0 * sum(status = 'GANHA') / sum(status <> 'EM_NEGOCIACAO'), 1) AS conversao_pct,
         sum(status = 'EM_NEGOCIACAO') AS propostas_em_negociacao
       FROM proposta`,
    )
    .get();

  return { contagens, indicadores };
}
