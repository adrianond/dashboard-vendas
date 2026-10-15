import { existsSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { readonlyDb } from "@/lib/db/readonly-client";

// Camada 1 de segurança (PRD, seção 14; critério de aceite 9). Todas as tentativas usam a
// conexão do agente; o último teste prova que nada mudou no banco.

function fotografar() {
  return {
    totais: readonlyDb
      .prepare(
        `SELECT
           (SELECT count(*) FROM unidade) AS unidades,
           (SELECT count(*) FROM vendedor) AS vendedores,
           (SELECT count(*) FROM cliente) AS clientes,
           (SELECT count(*) FROM produto) AS produtos,
           (SELECT count(*) FROM proposta) AS propostas,
           (SELECT count(*) FROM venda) AS vendas,
           (SELECT count(*) FROM meta_vendedor) AS metas,
           (SELECT sum(valor_final) FROM venda) AS soma_valor_final,
           (SELECT sum(valor_proposta) FROM proposta) AS soma_valor_proposta,
           (SELECT count(*) FROM sqlite_master) AS objetos`,
      )
      .get(),
    user_version: readonlyDb.pragma("user_version", { simple: true }),
    journal_mode: readonlyDb.pragma("journal_mode", { simple: true }),
  };
}

const ARQUIVO_INVASOR = "data/invasor.db";

const TENTATIVAS: [string, string][] = [
  [
    "INSERT",
    `INSERT INTO unidade (nome, cnpj, logradouro, numero, bairro, cidade, uf, regiao, cep, telefone, email, data_inauguracao)
     VALUES ('X', 'X', 'R', '1', 'B', 'C', 'SP', 'SUL', '0', '0', 'e', '2020-01-01')`,
  ],
  ["UPDATE", "UPDATE venda SET valor_final = 1"],
  ["DELETE", "DELETE FROM proposta"],
  ["DROP TABLE", "DROP TABLE venda"],
  ["DROP VIEW", "DROP VIEW vw_venda_detalhada"],
  ["CREATE TABLE", "CREATE TABLE invasora (a)"],
  ["CREATE INDEX", "CREATE INDEX idx_invasor ON cliente (nome)"],
  ["ALTER TABLE", "ALTER TABLE cliente ADD COLUMN invasora TEXT"],
  ["ATTACH de arquivo", `ATTACH DATABASE '${ARQUIVO_INVASOR}' AS invasor`],
  ["PRAGMA user_version", "PRAGMA user_version = 99"],
  ["PRAGMA journal_mode", "PRAGMA journal_mode = DELETE"],
  ["VACUUM", "VACUUM"],
  ["REINDEX", "REINDEX"],
];

describe("conexão somente leitura do agente (readonly-client.ts)", () => {
  let antes: ReturnType<typeof fotografar>;
  beforeAll(() => {
    antes = fotografar();
  });

  it("está aberta como readonly e com query_only ligado", () => {
    expect(readonlyDb.readonly).toBe(true);
    expect(readonlyDb.pragma("query_only", { simple: true })).toBe(1);
  });

  it.each(TENTATIVAS)("%s falha", (_nome, sql) => {
    expect(() => readonlyDb.exec(sql)).toThrow();
  });

  it("ATTACH de arquivo não cria o arquivo", () => {
    expect(existsSync(ARQUIVO_INVASOR)).toBe(false);
  });

  // O better-sqlite3 não permite bloquear o ATTACH ':memory:' (decisão registrada no README);
  // ele fica inerte, e o bloqueio total do ATTACH é do validador de SQL da Etapa 2.
  it("ATTACH ':memory:' fica inerte: nada pode ser criado", () => {
    readonlyDb.exec("ATTACH DATABASE ':memory:' AS anexo");
    try {
      expect(() => readonlyDb.exec("CREATE TABLE anexo.t (a)")).toThrow();
      expect(() => readonlyDb.exec("CREATE TEMP TABLE t (a)")).toThrow();
    } finally {
      readonlyDb.exec("DETACH DATABASE anexo");
    }
  });

  // Defesa em camadas: o query_only pode ser desligado por SQL, mas a abertura readonly do arquivo não.
  it("mesmo com query_only desligado, o arquivo readonly bloqueia a escrita", () => {
    try {
      readonlyDb.pragma("query_only = OFF");
      expect(() => readonlyDb.exec("DELETE FROM venda")).toThrow(/readonly/i);
    } finally {
      readonlyDb.pragma("query_only = ON");
    }
  });

  it("o banco permanece idêntico depois de todas as tentativas", () => {
    expect(fotografar()).toEqual(antes);
  });
});
