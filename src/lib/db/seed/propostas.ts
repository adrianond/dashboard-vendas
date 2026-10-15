import { fakerPT_BR as faker } from "@faker-js/faker";
import type { proposta, venda } from "../schema";
import { somarDias } from "./documentos";

// Regras da seção 7 do PRD. Funções puras: recebem linhas já inseridas (com IDs) e devolvem
// linhas novas, sem acessar o banco. Toda aleatoriedade vem do fakerPT_BR semeado no index.ts.

export const INICIO_PERIODO = "2024-10-01";
export const FIM_PERIODO = "2026-09-30";
const TOTAL_PROPOSTAS = 8000;
const INICIO_ULTIMOS_30_DIAS = "2026-09-01";
const FIM_PRIMEIRO_ANO = "2025-10-01"; // produtos fora de linha só recebem propostas antes desta data

type TipoVeiculo = "LEVE" | "MOTO" | "PESADO";
type FormaPagamento = "A_VISTA" | "FINANCIAMENTO" | "CONSORCIO" | "LEASING";
type Status = "EM_NEGOCIACAO" | "GANHA" | "PERDIDA" | "CANCELADA";
type MotivoPerda = "PRECO" | "CREDITO_NEGADO" | "DESISTENCIA" | "CONCORRENCIA" | "PRAZO_ENTREGA";

// Perfil fixo por unidade: peso de volume, conversão base e tipos vendidos.
// 8 de 12 vendem motos (~2/3) e 6 vendem pesados (metade); todas vendem leves.
const PERFIL_UNIDADE: Record<string, { peso: number; conversao: number; moto: boolean; pesado: boolean }> = {
  "São Paulo": { peso: 1.6, conversao: 0.42, moto: false, pesado: true },
  Campinas: { peso: 1.1, conversao: 0.38, moto: true, pesado: true },
  "Rio de Janeiro": { peso: 1.4, conversao: 0.33, moto: false, pesado: false },
  "Belo Horizonte": { peso: 1.2, conversao: 0.36, moto: true, pesado: true },
  "Vitória": { peso: 0.8, conversao: 0.3, moto: true, pesado: false },
  Curitiba: { peso: 1.0, conversao: 0.4, moto: false, pesado: true },
  "Porto Alegre": { peso: 1.0, conversao: 0.35, moto: false, pesado: true },
  Recife: { peso: 0.8, conversao: 0.3, moto: true, pesado: false },
  Salvador: { peso: 0.9, conversao: 0.28, moto: true, pesado: false },
  "Goiânia": { peso: 0.8, conversao: 0.34, moto: true, pesado: true },
  "Brasília": { peso: 1.0, conversao: 0.37, moto: true, pesado: false },
  Manaus: { peso: 0.6, conversao: 0.25, moto: true, pesado: false },
};

// Sazonalidade: mais propostas em dezembro e março, menos em fevereiro.
export const PESO_POR_MES: Record<number, number> = { 12: 1.35, 3: 1.25, 2: 0.75 };

const PESOS_TIPO = [
  { value: "LEVE" as const, weight: 70 },
  { value: "MOTO" as const, weight: 22 },
  { value: "PESADO" as const, weight: 8 },
];

const CHANCE_PJ: Record<TipoVeiculo, number> = { LEVE: 0.12, MOTO: 0.03, PESADO: 0.95 };

const PESOS_PAGAMENTO: Record<"PF" | "PJ" | "PESADO", { value: FormaPagamento; weight: number }[]> = {
  PF: [
    { value: "FINANCIAMENTO", weight: 52 },
    { value: "A_VISTA", weight: 33 },
    { value: "CONSORCIO", weight: 13 },
    { value: "LEASING", weight: 2 },
  ],
  PJ: [
    { value: "FINANCIAMENTO", weight: 40 },
    { value: "A_VISTA", weight: 25 },
    { value: "CONSORCIO", weight: 10 },
    { value: "LEASING", weight: 25 },
  ],
  PESADO: [
    { value: "FINANCIAMENTO", weight: 55 },
    { value: "A_VISTA", weight: 10 },
    { value: "CONSORCIO", weight: 5 },
    { value: "LEASING", weight: 30 },
  ],
};

const PARCELAS: Record<Exclude<FormaPagamento, "A_VISTA">, number[]> = {
  FINANCIAMENTO: [12, 24, 36, 48, 60],
  CONSORCIO: [36, 48, 60, 72, 80],
  LEASING: [24, 36, 48],
};

const PESOS_MOTIVO: { value: MotivoPerda; weight: number }[] = [
  { value: "PRECO", weight: 35 },
  { value: "CREDITO_NEGADO", weight: 20 },
  { value: "DESISTENCIA", weight: 20 },
  { value: "CONCORRENCIA", weight: 15 },
  { value: "PRAZO_ENTREGA", weight: 10 },
];

// Textos genéricos, sem dados pessoais (a coluna observacao fica fora das views).
const OBSERVACOES = [
  "Cliente pediu retorno na próxima semana.",
  "Aguardando aprovação de crédito.",
  "Cliente comparando com concorrente.",
  "Interesse em cor específica, verificar estoque.",
  "Avaliação do usado do cliente pendente.",
  "Cliente quer test drive antes de decidir.",
  "Negociação de acessórios inclusos.",
  "Prazo de entrega é decisivo para o cliente.",
];

export type UnidadeSeed = { id: number; cidade: string; uf: string };
export type VendedorSeed = { id: number; unidade_id: number; data_admissao: string; data_desligamento: string | null };
export type ClienteSeed = { id: number; tipo_pessoa: string; uf: string; data_cadastro: string };
export type ProdutoSeed = { id: number; tipo_veiculo: string; preco_tabela: number; ativo: number };

export type DadosVenda = { data_venda: string; valor_final: number; data_entrega: string | null };
export type PropostaGerada = { proposta: typeof proposta.$inferInsert; venda: DadosVenda | null };

const arredondar = (valor: number) => Math.round(valor * 100) / 100;

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

export function mesesDoPeriodo() {
  // 24 meses: 2024-10 a 2026-09
  return Array.from({ length: 24 }, (_, i) => {
    const ano = 2024 + Math.floor((9 + i) / 12);
    const mes = ((9 + i) % 12) + 1;
    return { ano, mes, dias: new Date(Date.UTC(ano, mes, 0)).getUTCDate(), peso: PESO_POR_MES[mes] ?? 1 };
  });
}

function ativoNaData(v: VendedorSeed, data: string): boolean {
  return v.data_admissao <= data && (v.data_desligamento === null || data < v.data_desligamento);
}

// Clientes agrupados por "UF|tipo" (e "*|tipo"), ordenados por data de cadastro, para sortear
// só entre os já cadastrados na data da proposta.
function indexarClientes(clientes: ClienteSeed[]) {
  const grupos = new Map<string, ClienteSeed[]>();
  const adicionar = (chave: string, c: ClienteSeed) => {
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(c);
  };
  for (const c of clientes) {
    adicionar(`${c.uf}|${c.tipo_pessoa}`, c);
    adicionar(`*|${c.tipo_pessoa}`, c);
  }
  for (const lista of grupos.values()) {
    lista.sort((a, b) => a.data_cadastro.localeCompare(b.data_cadastro) || a.id - b.id);
  }

  return (chave: string, data: string): ClienteSeed | null => {
    const lista = grupos.get(chave) ?? [];
    let ate = 0; // quantidade de clientes com data_cadastro <= data (busca binária)
    let fim = lista.length;
    while (ate < fim) {
      const meio = (ate + fim) >> 1;
      if (lista[meio].data_cadastro <= data) ate = meio + 1;
      else fim = meio;
    }
    return ate === 0 ? null : lista[faker.number.int({ min: 0, max: ate - 1 })];
  };
}

export function gerarPropostas(entrada: {
  unidades: UnidadeSeed[];
  vendedores: VendedorSeed[];
  clientes: ClienteSeed[];
  produtos: ProdutoSeed[];
}): PropostaGerada[] {
  const { unidades, vendedores, clientes, produtos } = entrada;
  const meses = mesesDoPeriodo();
  const diasDoPeriodo = diasEntre(INICIO_PERIODO, FIM_PERIODO);
  const sortearCliente = indexarClientes(clientes);

  // Perfil de cada vendedor: volume (0,6 a 1,6) e conversão (base da unidade ±0,08, entre 20% e 50%).
  const cidadeDaUnidade = new Map(unidades.map((u) => [u.id, u.cidade]));
  const perfilVendedor = new Map(
    vendedores.map((v) => {
      const base = PERFIL_UNIDADE[cidadeDaUnidade.get(v.unidade_id)!].conversao;
      const peso = faker.number.float({ min: 0.6, max: 1.6 });
      const conversao = Math.min(0.5, Math.max(0.2, base + faker.number.float({ min: -0.08, max: 0.08 })));
      return [v.id, { peso, conversao }];
    }),
  );

  // Fator de preço no início do período (5% a 8% abaixo do preço atual), por produto.
  const fatorInicial = new Map(produtos.map((p) => [p.id, faker.number.float({ min: 0.92, max: 0.95 })]));

  const geradas: PropostaGerada[] = [];

  for (let i = 0; i < TOTAL_PROPOSTAS; i++) {
    // 1. data (sazonalidade por mês)
    const m = faker.helpers.weightedArrayElement(meses.map((x) => ({ value: x, weight: x.peso })));
    const dia = faker.number.int({ min: 1, max: m.dias });
    const data_proposta = `${m.ano}-${String(m.mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

    // 2. tipo de veículo
    const tipo = faker.helpers.weightedArrayElement(PESOS_TIPO);

    // 3. unidade que vende o tipo e tem vendedor ativo na data
    const candidatas = unidades.filter((u) => {
      const perfil = PERFIL_UNIDADE[u.cidade];
      const vende = tipo === "LEVE" || (tipo === "MOTO" ? perfil.moto : perfil.pesado);
      return vende && vendedores.some((v) => v.unidade_id === u.id && ativoNaData(v, data_proposta));
    });
    const unidade = faker.helpers.weightedArrayElement(
      candidatas.map((u) => ({ value: u, weight: PERFIL_UNIDADE[u.cidade].peso })),
    );

    // 4. vendedor ativo da unidade, pelo peso de volume
    const vendedor = faker.helpers.weightedArrayElement(
      vendedores
        .filter((v) => v.unidade_id === unidade.id && ativoNaData(v, data_proposta))
        .map((v) => ({ value: v, weight: perfilVendedor.get(v.id)!.peso })),
    );

    // 5. cliente já cadastrado na data; ~85% da UF da unidade
    const tipoPessoa = faker.datatype.boolean({ probability: CHANCE_PJ[tipo] }) ? "PJ" : "PF";
    const mesmaUf = faker.datatype.boolean({ probability: 0.85 });
    const cliente =
      (mesmaUf ? sortearCliente(`${unidade.uf}|${tipoPessoa}`, data_proposta) : null) ??
      sortearCliente(`*|${tipoPessoa}`, data_proposta);
    if (!cliente) throw new Error(`Nenhum cliente ${tipoPessoa} cadastrado até ${data_proposta}`);

    // 6. produto do tipo (mais baratos são mais procurados; fora de linha só no primeiro ano)
    const produto = faker.helpers.weightedArrayElement(
      produtos
        .filter((p) => p.tipo_veiculo === tipo && (p.ativo === 1 || data_proposta < FIM_PRIMEIRO_ANO))
        .map((p) => ({ value: p, weight: 1 / Math.sqrt(p.preco_tabela) })),
    );

    // 7. preço de tabela na data: sobe linearmente até o preço atual no fim do período
    const f0 = fatorInicial.get(produto.id)!;
    const t = diasEntre(INICIO_PERIODO, data_proposta) / diasDoPeriodo;
    const valor_tabela = arredondar(produto.preco_tabela * (f0 + (1 - f0) * t));

    // 8. forma de pagamento
    const perfilPagamento = tipo === "PESADO" ? "PESADO" : tipoPessoa;
    const forma_pagamento = faker.helpers.weightedArrayElement(PESOS_PAGAMENTO[perfilPagamento]);

    // 9. status e fechamento (até 30 dias, sem passar do fim do período nem do desligamento)
    const limite =
      vendedor.data_desligamento && vendedor.data_desligamento < FIM_PERIODO ? vendedor.data_desligamento : FIM_PERIODO;
    const maxDias = Math.min(30, diasEntre(data_proposta, limite));
    let status: Status;
    if (maxDias < 1) {
      status = "EM_NEGOCIACAO";
    } else if (data_proposta >= INICIO_ULTIMOS_30_DIAS && faker.datatype.boolean({ probability: 0.85 })) {
      status = "EM_NEGOCIACAO";
    } else {
      const conversao = perfilVendedor.get(vendedor.id)!.conversao;
      const r = faker.number.float({ min: 0, max: 1 });
      status = r < conversao ? "GANHA" : r < conversao + 0.1 ? "CANCELADA" : "PERDIDA";
    }
    const data_fechamento =
      status === "EM_NEGOCIACAO" ? null : somarDias(data_proposta, faker.number.int({ min: 1, max: maxDias }));

    let motivo_perda: MotivoPerda | null = null;
    if (status === "PERDIDA") {
      motivo_perda = faker.helpers.weightedArrayElement(
        PESOS_MOTIVO.filter((x) => forma_pagamento !== "A_VISTA" || x.value !== "CREDITO_NEGADO"),
      );
    }

    // desconto de 0% a 10%; perdas por preço tendem a ter descontos menores (0% a 4%)
    const desconto = faker.number.float({ min: 0, max: motivo_perda === "PRECO" ? 0.04 : 0.1 });
    const valor_proposta = arredondar(valor_tabela * (1 - desconto));

    const valor_entrada =
      forma_pagamento === "FINANCIAMENTO"
        ? arredondar(valor_proposta * faker.number.float({ min: 0.1, max: 0.5 }))
        : null;
    const qtd_parcelas = forma_pagamento === "A_VISTA" ? null : faker.helpers.arrayElement(PARCELAS[forma_pagamento]);

    // 10. observação genérica em ~20% das propostas
    const observacao = faker.datatype.boolean({ probability: 0.2 }) ? faker.helpers.arrayElement(OBSERVACOES) : null;

    // 11. venda para as propostas GANHA
    let dadosVenda: DadosVenda | null = null;
    if (status === "GANHA") {
      const data_venda = data_fechamento!;
      const valor_final = faker.datatype.boolean({ probability: 0.2 })
        ? arredondar(valor_proposta * faker.number.float({ min: 0.99, max: 1.01 }))
        : valor_proposta;
      const entrega = somarDias(data_venda, faker.number.int({ min: 0, max: 45 }));
      dadosVenda = { data_venda, valor_final, data_entrega: entrega > FIM_PERIODO ? null : entrega };
    }

    geradas.push({
      proposta: {
        unidade_id: unidade.id,
        vendedor_id: vendedor.id,
        cliente_id: cliente.id,
        produto_id: produto.id,
        data_proposta,
        valor_tabela,
        valor_proposta,
        forma_pagamento,
        valor_entrada,
        qtd_parcelas,
        status,
        data_fechamento,
        motivo_perda,
        observacao,
      },
      venda: dadosVenda,
    });
  }

  // IDs em ordem cronológica (sort estável: empates mantêm a ordem de geração).
  return geradas.sort((a, b) => a.proposta.data_proposta.localeCompare(b.proposta.data_proposta));
}

// Uma venda por proposta GANHA; NF sequencial por unidade, na ordem das datas de venda.
export function gerarVendas(
  propostas: { id: number; unidade_id: number; venda: DadosVenda | null }[],
): (typeof venda.$inferInsert)[] {
  const ganhas = propostas
    .filter((p): p is { id: number; unidade_id: number; venda: DadosVenda } => p.venda !== null)
    .sort((a, b) => a.venda.data_venda.localeCompare(b.venda.data_venda) || a.id - b.id);

  const sequencialPorUnidade = new Map<number, number>();
  return ganhas.map((p) => {
    const seq = (sequencialPorUnidade.get(p.unidade_id) ?? 0) + 1;
    sequencialPorUnidade.set(p.unidade_id, seq);
    return {
      proposta_id: p.id,
      data_venda: p.venda.data_venda,
      valor_final: p.venda.valor_final,
      numero_nota_fiscal: `NF-${String(p.unidade_id).padStart(2, "0")}-${String(seq).padStart(6, "0")}`,
      data_entrega: p.venda.data_entrega,
    };
  });
}
