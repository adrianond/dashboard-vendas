import "server-only";
import { z } from "zod";
import { readonlyDb } from "../db/readonly-client";
import { env } from "../env";

// Filtros comuns dos indicadores (PRD da Etapa 3, seções 6.1 e 6.2). São a única entrada do
// usuário nesta camada: validados aqui e enviados à consulta só como parâmetros nomeados.

// Domínios, iguais aos CHECK de src/lib/db/schema.ts (tests/indicadores.test.ts confere).
export const REGIOES = ["NORTE", "NORDESTE", "CENTRO_OESTE", "SUDESTE", "SUL"] as const;
export const TIPOS_VEICULO = ["LEVE", "MOTO", "PESADO"] as const;
export const CATEGORIAS_POR_TIPO = {
  LEVE: ["HATCH", "SEDAN", "SUV", "PICAPE", "UTILITARIO"],
  MOTO: ["STREET", "TRAIL", "SCOOTER", "ESPORTIVA", "CUSTOM"],
  PESADO: ["CAMINHAO", "ONIBUS"],
} as const satisfies Record<(typeof TIPOS_VEICULO)[number], readonly string[]>;
export const CATEGORIAS = Object.values(CATEGORIAS_POR_TIPO).flat();

export type Regiao = (typeof REGIOES)[number];
export type TipoVeiculo = (typeof TIPOS_VEICULO)[number];
export type Categoria = (typeof CATEGORIAS_POR_TIPO)[TipoVeiculo][number];

const MESES_PADRAO = 12;
const MAX_MESES = 36;

// --- Datas (texto ISO AAAA-MM-DD, como no banco) ---

function dataValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const data = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === texto;
}

// Soma meses mantendo o dia, limitado ao último dia do mês de destino (31/01 + 1 mês = 28 ou 29/02).
export function somarMeses(data: string, meses: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const alvo = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

// Padrão do início: os 12 meses completos que terminam no mês do fim (fim 2026-09-30 → 2025-10-01).
function inicioPadrao(fim: string): string {
  return somarMeses(`${fim.slice(0, 7)}-01`, -(MESES_PADRAO - 1));
}

// --- Schema ---

// Na query string, "?regiao=" (texto vazio) conta como filtro ausente.
const opcional = <T extends z.ZodType>(esquema: T) =>
  z.preprocess((valor) => (valor === "" ? undefined : valor), esquema.optional());

const data = z.string().refine(dataValida, "use uma data válida no formato AAAA-MM-DD");
const umDe = (valores: readonly string[]) => `use um destes valores: ${valores.join(", ")}`;

const unidadeExiste = (id: number) => readonlyDb.prepare("SELECT 1 FROM vw_unidade WHERE id = ?").get(id) !== undefined;

export const esquemaFiltros = z
  .strictObject({
    inicio: opcional(data),
    fim: opcional(data),
    unidadeId: opcional(
      z
        .string()
        .regex(/^[1-9]\d{0,9}$/, "use o id numérico de uma unidade")
        .transform(Number),
    ),
    regiao: opcional(z.enum(REGIOES, { error: umDe(REGIOES) })),
    tipoVeiculo: opcional(z.enum(TIPOS_VEICULO, { error: umDe(TIPOS_VEICULO) })),
    categoria: opcional(z.enum(CATEGORIAS, { error: umDe(CATEGORIAS) })),
  })
  .transform((entrada, ctx) => {
    const fim = entrada.fim ?? env.DATA_REFERENCIA;
    const inicio = entrada.inicio ?? inicioPadrao(fim);
    const problema = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

    if (fim < inicio) problema("fim", "a data final deve ser igual ou posterior à inicial");
    else if (fim >= somarMeses(inicio, MAX_MESES)) problema("fim", `o período pode ter no máximo ${MAX_MESES} meses`);
    if (entrada.unidadeId !== undefined && !unidadeExiste(entrada.unidadeId)) problema("unidadeId", "unidade não encontrada");
    if (entrada.tipoVeiculo && entrada.categoria) {
      const categorias: readonly string[] = CATEGORIAS_POR_TIPO[entrada.tipoVeiculo];
      if (!categorias.includes(entrada.categoria)) {
        problema("categoria", `categoria incompatível com o tipo ${entrada.tipoVeiculo}: ${umDe(categorias)}`);
      }
    }
    return { ...entrada, inicio, fim };
  });

export type Filtros = z.output<typeof esquemaFiltros>;

export type LeituraFiltros = { ok: true; filtros: Filtros } | { ok: false; mensagens: string[] };

// Mensagens em português, sem ecoar o valor recebido; a API (passo 3.2) as transforma em ENTRADA_INVALIDA.
export function lerFiltros(entrada: URLSearchParams | Record<string, string | undefined>): LeituraFiltros {
  const objeto = entrada instanceof URLSearchParams ? Object.fromEntries(entrada) : entrada;
  const resultado = esquemaFiltros.safeParse(objeto);
  if (resultado.success) return { ok: true, filtros: resultado.data };
  return {
    ok: false,
    mensagens: resultado.error.issues.map((problema) =>
      problema.code === "unrecognized_keys"
        ? `parâmetro desconhecido: ${problema.keys.join(", ")}`
        : `${problema.path.join(".")}: ${problema.message}`,
    ),
  };
}

// --- WHERE parametrizado ---

// Colunas que cada view usa para os filtros. Os nomes vêm do código, nunca da entrada.
export type ColunasFiltro = { data: string; unidadeId: string; regiao?: string; tipoVeiculo?: string; categoria?: string };

const COLUNAS_COMUNS = { unidadeId: "unidade_id", regiao: "unidade_regiao", tipoVeiculo: "tipo_veiculo", categoria: "categoria" };
// Data de corte (PRD 6.2): indicadores de venda usam data_venda; de proposta e funil, data_proposta.
export const COLUNAS_VENDA: ColunasFiltro = { data: "data_venda", ...COLUNAS_COMUNS };
export const COLUNAS_PROPOSTA: ColunasFiltro = { data: "data_proposta", ...COLUNAS_COMUNS };

export type Where = { where: string; params: Record<string, string | number> };

// O texto do SQL só tem nomes de coluna e placeholders (@nome); os valores vão em params.
export function montarWhere(filtros: Filtros, colunas: ColunasFiltro): Where {
  const condicoes = [`${colunas.data} BETWEEN @inicio AND @fim`];
  const params: Where["params"] = { inicio: filtros.inicio, fim: filtros.fim };
  const opcionais = [
    ["unidadeId", colunas.unidadeId, filtros.unidadeId],
    ["regiao", colunas.regiao, filtros.regiao],
    ["tipoVeiculo", colunas.tipoVeiculo, filtros.tipoVeiculo],
    ["categoria", colunas.categoria, filtros.categoria],
  ] as const;
  for (const [nome, coluna, valor] of opcionais) {
    if (valor === undefined) continue;
    // Erro de programação: o indicador recebeu um filtro que a view dele não suporta.
    if (!coluna) throw new Error(`filtro ${nome} não suportado por esta consulta`);
    condicoes.push(`${coluna} = @${nome}`);
    params[nome] = valor;
  }
  return { where: condicoes.join(" AND "), params };
}
