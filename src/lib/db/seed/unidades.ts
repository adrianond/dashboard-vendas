import { fakerPT_BR as faker } from "@faker-js/faker";
import type { unidade } from "../schema";
import { dataEntre, gerarCnpj, slug, telefoneFixo } from "./documentos";

export type Regiao = "NORTE" | "NORDESTE" | "CENTRO_OESTE" | "SUDESTE" | "SUL";

type DefUnidade = { cidade: string; uf: string; regiao: Regiao; ddd: string; cepPrefixo: string };

// 12 unidades fixas, distribuídas pelas 5 regiões, com mais unidades no Sudeste.
export const UNIDADES_DEF: DefUnidade[] = [
  { cidade: "São Paulo", uf: "SP", regiao: "SUDESTE", ddd: "11", cepPrefixo: "01" },
  { cidade: "Campinas", uf: "SP", regiao: "SUDESTE", ddd: "19", cepPrefixo: "13" },
  { cidade: "Rio de Janeiro", uf: "RJ", regiao: "SUDESTE", ddd: "21", cepPrefixo: "20" },
  { cidade: "Belo Horizonte", uf: "MG", regiao: "SUDESTE", ddd: "31", cepPrefixo: "30" },
  { cidade: "Vitória", uf: "ES", regiao: "SUDESTE", ddd: "27", cepPrefixo: "29" },
  { cidade: "Curitiba", uf: "PR", regiao: "SUL", ddd: "41", cepPrefixo: "80" },
  { cidade: "Porto Alegre", uf: "RS", regiao: "SUL", ddd: "51", cepPrefixo: "90" },
  { cidade: "Recife", uf: "PE", regiao: "NORDESTE", ddd: "81", cepPrefixo: "50" },
  { cidade: "Salvador", uf: "BA", regiao: "NORDESTE", ddd: "71", cepPrefixo: "40" },
  { cidade: "Goiânia", uf: "GO", regiao: "CENTRO_OESTE", ddd: "62", cepPrefixo: "74" },
  { cidade: "Brasília", uf: "DF", regiao: "CENTRO_OESTE", ddd: "61", cepPrefixo: "70" },
  { cidade: "Manaus", uf: "AM", regiao: "NORTE", ddd: "92", cepPrefixo: "69" },
];

// Cidades reais por UF, usadas no endereço dos clientes: as UFs das unidades e mais algumas
// para os clientes de fora.
export const CIDADES_POR_UF: Record<string, { ddd: string; cidades: string[] }> = {
  SP: { ddd: "11", cidades: ["São Paulo", "Guarulhos", "Osasco", "Santo André", "Campinas", "Jundiaí", "Sorocaba"] },
  RJ: { ddd: "21", cidades: ["Rio de Janeiro", "Niterói", "Duque de Caxias", "Nova Iguaçu"] },
  MG: { ddd: "31", cidades: ["Belo Horizonte", "Contagem", "Betim"] },
  ES: { ddd: "27", cidades: ["Vitória", "Vila Velha", "Serra"] },
  PR: { ddd: "41", cidades: ["Curitiba", "São José dos Pinhais", "Ponta Grossa"] },
  RS: { ddd: "51", cidades: ["Porto Alegre", "Canoas", "Caxias do Sul"] },
  PE: { ddd: "81", cidades: ["Recife", "Olinda", "Jaboatão dos Guararapes"] },
  BA: { ddd: "71", cidades: ["Salvador", "Lauro de Freitas", "Feira de Santana"] },
  GO: { ddd: "62", cidades: ["Goiânia", "Aparecida de Goiânia", "Anápolis"] },
  DF: { ddd: "61", cidades: ["Brasília"] },
  AM: { ddd: "92", cidades: ["Manaus"] },
  SC: { ddd: "48", cidades: ["Florianópolis", "Joinville"] },
  CE: { ddd: "85", cidades: ["Fortaleza"] },
  PA: { ddd: "91", cidades: ["Belém"] },
  MT: { ddd: "65", cidades: ["Cuiabá"] },
  MS: { ddd: "67", cidades: ["Campo Grande"] },
  RN: { ddd: "84", cidades: ["Natal"] },
};

export function dddDaUnidade(cidade: string): string {
  const def = UNIDADES_DEF.find((u) => u.cidade === cidade);
  if (!def) throw new Error(`Unidade desconhecida: ${cidade}`);
  return def.ddd;
}

const BAIRROS = ["Centro", "Jardim América", "Vila Nova", "Boa Vista", "Santa Cruz", "Industrial", "São José", "Bela Vista"];

export function gerarUnidades(): (typeof unidade.$inferInsert)[] {
  return UNIDADES_DEF.map((def) => ({
    nome: `AutoRede ${def.cidade}`,
    cnpj: gerarCnpj(),
    logradouro: faker.location.street(),
    numero: String(faker.number.int({ min: 10, max: 9999 })),
    bairro: faker.helpers.arrayElement(BAIRROS),
    cidade: def.cidade,
    uf: def.uf,
    regiao: def.regiao,
    cep: `${def.cepPrefixo}${faker.string.numeric(3)}-${faker.string.numeric(3)}`,
    telefone: telefoneFixo(def.ddd),
    email: `contato.${slug(def.cidade)}@autorede.exemplo.com.br`,
    data_inauguracao: dataEntre("2005-01-01", "2023-12-31"),
    ativo: 1,
  }));
}
