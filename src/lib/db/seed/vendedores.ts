import { fakerPT_BR as faker } from "@faker-js/faker";
import type { vendedor } from "../schema";
import { celular, dataEntre, gerarCpf, slug, somarDias } from "./documentos";
import { dddDaUnidade } from "./unidades";

// Período de dados do PRD (seção 7): 2024-10-01 a 2026-09-30.
const MIN_ATIVOS_POR_UNIDADE = 3;

export function gerarVendedores(
  unidades: { id: number; cidade: string }[],
): (typeof vendedor.$inferInsert)[] {
  const linhas: (typeof vendedor.$inferInsert)[] = [];
  let sequencial = 0;

  for (const u of unidades) {
    const ddd = dddDaUnidade(u.cidade);
    const quantidade = faker.number.int({ min: 4, max: 8 });
    let ativos = quantidade;

    for (let i = 0; i < quantidade; i++) {
      const nome = `${faker.person.firstName()} ${faker.person.lastName()}`;

      // ~15% admitidos no meio do período (com tempo para ainda vender); os demais, antes dele.
      const data_admissao = faker.datatype.boolean({ probability: 0.15 })
        ? dataEntre("2024-10-01", "2026-03-31")
        : dataEntre("2016-01-01", "2024-09-30");

      // ~10% desligados durante o período, preservando um mínimo de ativos por unidade.
      let data_desligamento: string | null = null;
      if (ativos > MIN_ATIVOS_POR_UNIDADE && faker.datatype.boolean({ probability: 0.1 })) {
        const noventaDias = somarDias(data_admissao, 90);
        const inicio = noventaDias > "2024-12-01" ? noventaDias : "2024-12-01";
        if (inicio <= "2026-08-31") {
          data_desligamento = dataEntre(inicio, "2026-08-31");
          ativos--;
        }
      }

      sequencial++;
      linhas.push({
        unidade_id: u.id,
        nome,
        cpf: gerarCpf(),
        email: `${slug(nome)}.${sequencial}@autorede.exemplo.com.br`,
        telefone: celular(ddd),
        data_admissao,
        data_desligamento,
        ativo: data_desligamento ? 0 : 1,
      });
    }
  }

  return linhas;
}
