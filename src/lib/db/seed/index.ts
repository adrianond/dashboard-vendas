import { fakerPT_BR as faker } from "@faker-js/faker";
import { sql } from "drizzle-orm";
import { db, sqlite } from "../client";
import { cliente, meta_vendedor, produto, proposta, unidade, venda, vendedor } from "../schema";
import { gerarProdutos } from "./catalogo";
import { gerarClientes } from "./clientes";
import { reiniciarDocumentos } from "./documentos";
import { gerarUnidades } from "./unidades";
import { gerarVendedores } from "./vendedores";

// Semente fixa: rodar o seed duas vezes gera exatamente o mesmo banco (PRD, seção 7).
const SEMENTE = 42;
const TAMANHO_LOTE = 500;

// Ordem de limpeza: tabelas filhas antes das mães, por causa das FKs.
const TABELAS_PARA_LIMPAR = [venda, proposta, meta_vendedor, vendedor, cliente, produto, unidade];
const TABELAS = ["unidade", "vendedor", "cliente", "produto", "proposta", "venda", "meta_vendedor"];

function emLotes<T>(linhas: T[]): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) lotes.push(linhas.slice(i, i + TAMANHO_LOTE));
  return lotes;
}

export function executarSeed() {
  faker.seed(SEMENTE);
  reiniciarDocumentos();

  db.transaction((tx) => {
    for (const tabela of TABELAS_PARA_LIMPAR) tx.delete(tabela).run();
    tx.run(sql`DELETE FROM sqlite_sequence`); // IDs voltam a começar em 1

    const unidades = tx
      .insert(unidade)
      .values(gerarUnidades())
      .returning({ id: unidade.id, cidade: unidade.cidade, uf: unidade.uf })
      .all();

    for (const lote of emLotes(gerarProdutos())) tx.insert(produto).values(lote).run();
    for (const lote of emLotes(gerarVendedores(unidades))) tx.insert(vendedor).values(lote).run();
    for (const lote of emLotes(gerarClientes(unidades))) tx.insert(cliente).values(lote).run();
  });

  return resumirCarga();
}

function valor(consulta: string): number {
  return (sqlite.prepare(consulta).get() as { n: number }).n;
}

function resumirCarga() {
  const contagens = Object.fromEntries(TABELAS.map((t) => [t, valor(`SELECT count(*) AS n FROM ${t}`)]));

  const detalhes = {
    vendedores_ativos: valor("SELECT count(*) AS n FROM vendedor WHERE ativo = 1"),
    vendedores_desligados: valor("SELECT count(*) AS n FROM vendedor WHERE data_desligamento IS NOT NULL"),
    vendedores_admitidos_no_periodo: valor("SELECT count(*) AS n FROM vendedor WHERE data_admissao >= '2024-10-01'"),
    clientes_pf: valor("SELECT count(*) AS n FROM cliente WHERE tipo_pessoa = 'PF'"),
    clientes_pj: valor("SELECT count(*) AS n FROM cliente WHERE tipo_pessoa = 'PJ'"),
    clientes_na_uf_de_alguma_unidade: valor(
      "SELECT count(*) AS n FROM cliente WHERE uf IN (SELECT uf FROM unidade)",
    ),
    produtos_leve: valor("SELECT count(*) AS n FROM produto WHERE tipo_veiculo = 'LEVE'"),
    produtos_moto: valor("SELECT count(*) AS n FROM produto WHERE tipo_veiculo = 'MOTO'"),
    produtos_pesado: valor("SELECT count(*) AS n FROM produto WHERE tipo_veiculo = 'PESADO'"),
  };

  return { contagens, detalhes };
}
