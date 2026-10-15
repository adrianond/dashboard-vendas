import { readonlyDb } from "../src/lib/db/readonly-client";
import { resumirBanco, verificarIntegridade } from "../src/lib/db/check";

// Só lê o banco: usa a conexão somente leitura (menor privilégio).
const resultados = verificarIntegridade(readonlyDb);
for (const r of resultados) {
  console.log(`${r.violacoes === 0 ? "OK   " : "FALHA"} ${r.regra}${r.violacoes ? ` (${r.violacoes} violações)` : ""}`);
  if (r.violacoes) console.table(r.exemplos);
}

const resumo = resumirBanco(readonlyDb);
console.log("\nResumo:");
console.table(resumo.contagens);
console.log(resumo.indicadores);

const falhas = resultados.filter((r) => r.violacoes > 0).length;
console.log(falhas === 0 ? "\nNenhuma violação." : `\n${falhas} regra(s) violada(s).`);
process.exit(falhas === 0 ? 0 : 1);
