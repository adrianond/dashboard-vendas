import { count } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, sqlite } from "@/lib/db/client";
import { cliente, meta_vendedor, produto, proposta, unidade, venda, vendedor } from "@/lib/db/schema";

// Integração: importa o MESMO client.ts usado pelo Next.js e lê o banco fora dos scripts de seed.
const TABELAS = { unidade, vendedor, cliente, produto, proposta, venda, meta_vendedor };

const contar = (tabela: (typeof TABELAS)[keyof typeof TABELAS]) =>
  db.select({ n: count() }).from(tabela).get()!.n;

describe("camada de banco da aplicação (client.ts)", () => {
  it("lê as contagens de todas as tabelas pelo Drizzle", () => {
    for (const [nome, tabela] of Object.entries(TABELAS)) {
      expect(contar(tabela), nome).toBeGreaterThan(0);
    }
  });

  it("volumes dentro de ±10% da seção 7 do PRD", () => {
    const dentro = (valor: number, alvo: number) => valor >= alvo * 0.9 && valor <= alvo * 1.1;
    expect(contar(unidade)).toBe(12);
    expect(dentro(contar(vendedor), 70)).toBe(true);
    expect(dentro(contar(cliente), 3000)).toBe(true);
    expect(dentro(contar(produto), 60)).toBe(true);
    expect(dentro(contar(proposta), 8000)).toBe(true);
  });

  it("conexão com WAL e chaves estrangeiras ligadas", () => {
    expect(sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  });
});
