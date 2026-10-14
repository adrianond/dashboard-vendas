import { fakerPT_BR as faker } from "@faker-js/faker";
import type { cliente } from "../schema";
import { celular, dataEntre, gerarCnpj, gerarCpf, slug, telefoneFixo } from "./documentos";
import { CIDADES_POR_UF } from "./unidades";

export const TOTAL_CLIENTES = 3000;

// Cada cliente é gerado "a partir" de uma unidade sorteada: ~85% moram na UF dela e os demais
// em outra UF. O vínculo real com a unidade nasce nas propostas (passo 1.4).
export function gerarClientes(unidades: { uf: string }[]): (typeof cliente.$inferInsert)[] {
  const ufs = Object.keys(CIDADES_POR_UF);
  const linhas: (typeof cliente.$inferInsert)[] = [];

  for (let i = 1; i <= TOTAL_CLIENTES; i++) {
    const pj = faker.datatype.boolean({ probability: 0.15 });
    const ufDaUnidade = faker.helpers.arrayElement(unidades).uf;
    const uf = faker.datatype.boolean({ probability: 0.85 })
      ? ufDaUnidade
      : faker.helpers.arrayElement(ufs.filter((x) => x !== ufDaUnidade));
    const { ddd, cidades } = CIDADES_POR_UF[uf];
    const cidade = faker.helpers.arrayElement(cidades);

    // ~60% já cadastrados antes do período; ~40% cadastrados durante ele.
    const data_cadastro = faker.datatype.boolean({ probability: 0.6 })
      ? dataEntre("2018-01-01", "2024-09-30")
      : dataEntre("2024-10-01", "2026-08-31");

    if (pj) {
      const nome = faker.company.name();
      linhas.push({
        tipo_pessoa: "PJ",
        nome,
        documento: gerarCnpj(),
        email: faker.datatype.boolean({ probability: 0.9 }) ? `contato.${i}@${slug(nome)}.exemplo.com.br` : null,
        telefone: telefoneFixo(ddd),
        cidade,
        uf,
        data_nascimento: null,
        data_cadastro,
      });
    } else {
      const primeiroNome = faker.person.firstName();
      // A lista de sobrenomes do pt_BR é curta: evita nomes como "Laura Macedo Macedo".
      const sobrenome1 = faker.person.lastName();
      let sobrenome2 = faker.person.lastName();
      while (sobrenome2 === sobrenome1) sobrenome2 = faker.person.lastName();
      const nome = `${primeiroNome} ${sobrenome1} ${sobrenome2}`;
      linhas.push({
        tipo_pessoa: "PF",
        nome,
        documento: gerarCpf(),
        email: faker.datatype.boolean({ probability: 0.7 }) ? `${slug(nome)}.${i}@exemplo.com.br` : null,
        telefone: celular(ddd),
        cidade,
        uf,
        // Todos com 18 anos ou mais no início do período (2024-10-01).
        data_nascimento: dataEntre("1950-01-01", "2006-09-30"),
        data_cadastro,
      });
    }
  }

  return linhas;
}
