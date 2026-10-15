import { fakerPT_BR as faker } from "@faker-js/faker";
import { sql } from "drizzle-orm";
import { db, sqlite } from "../client";
import { cliente, meta_vendedor, produto, proposta, unidade, venda, vendedor } from "../schema";
import { gerarProdutos } from "./catalogo";
import { gerarClientes } from "./clientes";
import { reiniciarDocumentos } from "./documentos";
import { gerarMetas } from "./metas";
import { gerarPropostas, gerarVendas } from "./propostas";
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

    // ===== Cadastros (passo 1.3) =====
    const unidades = tx
      .insert(unidade)
      .values(gerarUnidades())
      .returning({ id: unidade.id, cidade: unidade.cidade, uf: unidade.uf })
      .all();

    const produtos = emLotes(gerarProdutos()).flatMap((lote) =>
      tx
        .insert(produto)
        .values(lote)
        .returning({
          id: produto.id,
          tipo_veiculo: produto.tipo_veiculo,
          preco_tabela: produto.preco_tabela,
          ativo: produto.ativo,
        })
        .all(),
    );

    const vendedores = emLotes(gerarVendedores(unidades)).flatMap((lote) =>
      tx
        .insert(vendedor)
        .values(lote)
        .returning({
          id: vendedor.id,
          unidade_id: vendedor.unidade_id,
          data_admissao: vendedor.data_admissao,
          data_desligamento: vendedor.data_desligamento,
        })
        .all(),
    );

    const clientes = emLotes(gerarClientes(unidades)).flatMap((lote) =>
      tx
        .insert(cliente)
        .values(lote)
        .returning({
          id: cliente.id,
          tipo_pessoa: cliente.tipo_pessoa,
          uf: cliente.uf,
          data_cadastro: cliente.data_cadastro,
        })
        .all(),
    );

    // ===== Movimento (passo 1.4) =====
    const propostas = gerarPropostas({ unidades, vendedores, clientes, produtos });
    for (const lote of emLotes(propostas)) tx.insert(proposta).values(lote.map((p) => p.proposta)).run();

    // O RETURNING do SQLite não garante ordem; como a sequência foi zerada e tudo roda nesta
    // transação, os IDs são 1..N na ordem de inserção. Conferimos antes de usar.
    const ids = tx.get<{ minimo: number; maximo: number; total: number }>(
      sql`SELECT min(id) AS minimo, max(id) AS maximo, count(*) AS total FROM proposta`,
    );
    if (ids.minimo !== 1 || ids.maximo !== propostas.length || ids.total !== propostas.length) {
      throw new Error(`IDs de proposta inesperados: ${JSON.stringify(ids)}`);
    }

    const vendas = gerarVendas(
      propostas.map((p, i) => ({ id: i + 1, unidade_id: p.proposta.unidade_id, venda: p.venda })),
    );
    for (const lote of emLotes(vendas)) tx.insert(venda).values(lote).run();

    const metas = gerarMetas({ vendedores, propostas });
    for (const lote of emLotes(metas)) tx.insert(meta_vendedor).values(lote).run();
  });

  return resumirCarga();
}

function valor(consulta: string): number {
  return (sqlite.prepare(consulta).get() as { n: number }).n;
}

function tabela(consulta: string) {
  return sqlite.prepare(consulta).all();
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

  // Taxa de conversão = propostas GANHA / propostas fechadas (GANHA + PERDIDA + CANCELADA).
  const analise = {
    propostas_por_status: tabela(
      "SELECT status, count(*) AS propostas FROM proposta GROUP BY status ORDER BY propostas DESC",
    ),
    geral: sqlite
      .prepare(
        `SELECT
           (SELECT count(*) FROM venda) AS total_vendas,
           (SELECT round(sum(valor_final), 2) FROM venda) AS receita_total,
           round(100.0 * sum(status = 'GANHA') / sum(status <> 'EM_NEGOCIACAO'), 1) AS conversao_pct
         FROM proposta`,
      )
      .get(),
    conversao_por_unidade: tabela(
      `SELECT u.nome AS unidade, count(*) AS propostas,
              round(100.0 * sum(p.status = 'GANHA') / sum(p.status <> 'EM_NEGOCIACAO'), 1) AS conversao_pct
       FROM proposta p JOIN unidade u ON u.id = p.unidade_id
       GROUP BY u.id ORDER BY conversao_pct DESC`,
    ),
    vendas_por_tipo: tabela(
      `SELECT pr.tipo_veiculo, count(*) AS vendas, round(sum(v.valor_final), 2) AS receita
       FROM venda v JOIN proposta p ON p.id = v.proposta_id JOIN produto pr ON pr.id = p.produto_id
       GROUP BY pr.tipo_veiculo ORDER BY receita DESC`,
    ),
  };

  return { contagens, detalhes, analise };
}
