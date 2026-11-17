import "server-only";
import { env } from "../env";

// Rate limiting em memória (PRD da Etapa 3, seção 7.4): janela deslizante por chave. Vale para uma
// única instância do servidor; várias instâncias exigiriam um armazenamento compartilhado.

const MINUTO_MS = 60_000;
const DIA_MS = 24 * 60 * MINUTO_MS;

export class JanelaDeslizante {
  private readonly registros = new Map<string, number[]>();

  constructor(
    readonly limite: number,
    readonly janelaMs: number,
  ) {}

  // Milissegundos até haver vaga (0 = há vaga agora).
  esperaMs(chave: string, agora: number): number {
    const recentes = this.recentes(chave, agora);
    return recentes.length < this.limite ? 0 : recentes[0] + this.janelaMs - agora;
  }

  registrar(chave: string, agora: number): void {
    const recentes = this.recentes(chave, agora);
    recentes.push(agora);
    this.registros.set(chave, recentes);
  }

  // Descarta os registros fora da janela (e a chave, se não sobrar nenhum).
  private recentes(chave: string, agora: number): number[] {
    const recentes = (this.registros.get(chave) ?? []).filter((instante) => instante > agora - this.janelaMs);
    if (recentes.length === 0) this.registros.delete(chave);
    else this.registros.set(chave, recentes);
    return recentes;
  }
}

export type CategoriaLimite = "agente" | "feedback" | "indicadores";
export type Limitadores = Record<CategoriaLimite, JanelaDeslizante[]>;

export type LimitesConfig = Pick<
  typeof env,
  "RATE_LIMIT_AGENTE_MINUTO" | "RATE_LIMIT_AGENTE_DIA" | "RATE_LIMIT_FEEDBACK_MINUTO" | "RATE_LIMIT_INDICADORES_MINUTO"
>;

export function criarLimitadores(config: LimitesConfig = env): Limitadores {
  return {
    // As rotas perguntar e perguntar/stream compartilham estas janelas.
    agente: [
      new JanelaDeslizante(config.RATE_LIMIT_AGENTE_MINUTO, MINUTO_MS),
      new JanelaDeslizante(config.RATE_LIMIT_AGENTE_DIA, DIA_MS),
    ],
    feedback: [new JanelaDeslizante(config.RATE_LIMIT_FEEDBACK_MINUTO, MINUTO_MS)],
    indicadores: [new JanelaDeslizante(config.RATE_LIMIT_INDICADORES_MINUTO, MINUTO_MS)],
  };
}

// Uma instância por processo (como a conexão do banco), para sobreviver ao hot reload do next dev.
const globalParaLimites = globalThis as unknown as { limitadoresApi?: Limitadores };
export const limitadores = (globalParaLimites.limitadoresApi ??= criarLimitadores());

export type ResultadoLimite = { ok: true } | { ok: false; retryAfterSeg: number };

// Só consome se TODAS as janelas da categoria tiverem vaga (ex.: minuto e dia do agente).
export function consumirLimite(
  categoria: CategoriaLimite,
  chave: string,
  agora: number = Date.now(),
  conjunto: Limitadores = limitadores,
): ResultadoLimite {
  const janelas = conjunto[categoria];
  const espera = Math.max(...janelas.map((janela) => janela.esperaMs(chave, agora)));
  if (espera > 0) return { ok: false, retryAfterSeg: Math.ceil(espera / 1000) };
  for (const janela of janelas) janela.registrar(chave, agora);
  return { ok: true };
}

// Sem TRUST_PROXY, o x-forwarded-for pode ser forjado pelo cliente: todas as requisições usam a
// mesma chave. Com proxy confiável, vale o último endereço da lista, o que o próprio proxy acrescentou.
export function chaveDoCliente(request: Request, confiarNoProxy: boolean = env.TRUST_PROXY === "true"): string {
  if (!confiarNoProxy) return "local";
  const enderecos = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((endereco) => endereco.trim())
    .filter(Boolean);
  return enderecos.at(-1) ?? "desconhecido";
}
