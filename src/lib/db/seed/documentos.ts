import { fakerPT_BR as faker } from "@faker-js/faker";

// Auxiliares do seed: CPF/CNPJ válidos e únicos, datas ISO, telefones e slugs.
// Toda aleatoriedade vem do fakerPT_BR, semeado uma única vez em seed/index.ts.

const documentosUsados = new Set<string>();

// Permite rodar o seed mais de uma vez no mesmo processo com o mesmo resultado.
export function reiniciarDocumentos() {
  documentosUsados.clear();
}

function digitos(n: number): number[] {
  return Array.from({ length: n }, () => faker.number.int({ min: 0, max: 9 }));
}

function digitoVerificador(base: number[], pesos: number[]): number {
  const resto = base.reduce((soma, d, i) => soma + d * pesos[i], 0) % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function registrar(documento: string): boolean {
  if (documentosUsados.has(documento)) return false;
  documentosUsados.add(documento);
  return true;
}

export function gerarCpf(): string {
  for (;;) {
    const base = digitos(9);
    if (base.every((d) => d === base[0])) continue; // 111.111.111-11 etc. são inválidos
    const d1 = digitoVerificador(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = digitoVerificador([...base, d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const s = [...base, d1, d2].join("");
    const cpf = `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
    if (registrar(cpf)) return cpf;
  }
}

export function gerarCnpj(): string {
  for (;;) {
    const base = [...digitos(8), 0, 0, 0, 1]; // matriz: filial 0001
    const d1 = digitoVerificador(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = digitoVerificador([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const s = [...base, d1, d2].join("");
    const cnpj = `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
    if (registrar(cnpj)) return cnpj;
  }
}

// Datas sempre em UTC, para o resultado não depender do fuso horário da máquina.
export function dataEntre(de: string, ate: string): string {
  return faker.date
    .between({ from: `${de}T00:00:00Z`, to: `${ate}T00:00:00Z` })
    .toISOString()
    .slice(0, 10);
}

export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function celular(ddd: string): string {
  return `(${ddd}) 9${faker.string.numeric(4)}-${faker.string.numeric(4)}`;
}

export function telefoneFixo(ddd: string): string {
  return `(${ddd}) 3${faker.string.numeric(3)}-${faker.string.numeric(4)}`;
}

export function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
}
