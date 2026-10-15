import { fakerPT_BR as faker } from "@faker-js/faker";
import type { meta_vendedor } from "../schema";
import { mesesDoPeriodo, type PropostaGerada, type VendedorSeed } from "./propostas";

// Uma meta por vendedor por mês em que esteve ativo (mesmo que só parte do mês). As metas
// partem do desempenho médio do vendedor, com sazonalidade e variação aleatória, para que
// ~40–60% dos vendedores batam a meta num mês típico (PRD, seção 7). As metas de quantidade e
// de valor são calculadas de forma independente.

const arredondar = (valor: number) => Math.round(valor * 100) / 100;

export function gerarMetas(entrada: {
  vendedores: VendedorSeed[];
  propostas: PropostaGerada[];
}): (typeof meta_vendedor.$inferInsert)[] {
  const { vendedores, propostas } = entrada;
  const meses = mesesDoPeriodo().map((m) => {
    const mm = String(m.mes).padStart(2, "0");
    return { ...m, primeiroDia: `${m.ano}-${mm}-01`, ultimoDia: `${m.ano}-${mm}-${String(m.dias).padStart(2, "0")}` };
  });
  const pesoMedio = meses.reduce((soma, m) => soma + m.peso, 0) / meses.length;

  // Vendas realizadas por vendedor e por unidade (para o ticket médio de quem não vendeu nada).
  const totalPorVendedor = new Map<number, { qtd: number; valor: number }>();
  const totalPorUnidade = new Map<number, { qtd: number; valor: number }>();
  for (const { proposta, venda } of propostas) {
    if (!venda) continue;
    for (const [mapa, chave] of [
      [totalPorVendedor, proposta.vendedor_id],
      [totalPorUnidade, proposta.unidade_id],
    ] as const) {
      const atual = mapa.get(chave) ?? { qtd: 0, valor: 0 };
      mapa.set(chave, { qtd: atual.qtd + 1, valor: atual.valor + venda.valor_final });
    }
  }

  const linhas: (typeof meta_vendedor.$inferInsert)[] = [];

  for (const v of vendedores) {
    const mesesAtivos = meses.filter(
      (m) => v.data_admissao <= m.ultimoDia && (v.data_desligamento === null || v.data_desligamento >= m.primeiroDia),
    );
    if (mesesAtivos.length === 0) continue;

    const doVendedor = totalPorVendedor.get(v.id) ?? { qtd: 0, valor: 0 };
    const daUnidade = totalPorUnidade.get(v.unidade_id) ?? { qtd: 1, valor: 0 };
    const qtdMensal = doVendedor.qtd / mesesAtivos.length;
    // Sem vendas no período: um ticket médio da unidade por mês, para a meta de valor ser > 0.
    const valorMensal =
      doVendedor.qtd > 0 ? doVendedor.valor / mesesAtivos.length : daUnidade.valor / daUnidade.qtd;

    for (const m of mesesAtivos) {
      const sazonal = m.peso / pesoMedio;
      const meta_quantidade = Math.max(1, Math.round(qtdMensal * sazonal * faker.number.float({ min: 0.95, max: 1.3 })));
      const meta_valor = arredondar(valorMensal * sazonal * faker.number.float({ min: 0.8, max: 1.1 }));
      linhas.push({ vendedor_id: v.id, ano: m.ano, mes: m.mes, meta_quantidade, meta_valor });
    }
  }

  return linhas;
}
