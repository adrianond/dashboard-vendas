import { executarSeed } from "../src/lib/db/seed";

try {
  const inicio = performance.now();
  const resumo = executarSeed();
  console.table(resumo.contagens);
  console.log(resumo.detalhes);

  console.log("\nPropostas por status:");
  console.table(resumo.analise.propostas_por_status);
  console.log("Totais (conversão = GANHA / fechadas):");
  console.table([resumo.analise.geral]);
  console.log("Conversão por unidade:");
  console.table(resumo.analise.conversao_por_unidade);
  console.log("Vendas e receita por tipo de veículo:");
  console.table(resumo.analise.vendas_por_tipo);

  console.log(`Seed concluído em ${Math.round(performance.now() - inicio)} ms.`);
} catch (erro) {
  console.error("Falha no seed:", erro);
  process.exit(1);
}
