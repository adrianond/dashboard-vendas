import { executarSeed } from "../src/lib/db/seed";

try {
  const inicio = performance.now();
  const resumo = executarSeed();
  console.table(resumo.contagens);
  console.log(resumo.detalhes);
  console.log(`Seed concluído em ${Math.round(performance.now() - inicio)} ms.`);
} catch (erro) {
  console.error("Falha no seed:", erro);
  process.exit(1);
}
