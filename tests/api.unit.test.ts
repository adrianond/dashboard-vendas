import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LIMITE_CORPO_BYTES, lerCorpoJson } from "@/lib/api/body";
import { ERROS, ErroApi, respostaDeErro, type CorpoErro } from "@/lib/api/errors";
import { criarRota, lerConsulta, type EntradaLog } from "@/lib/api/handler";
import { JanelaDeslizante, chaveDoCliente, consumirLimite, criarLimitadores } from "@/lib/api/rate-limit";
import { verificarSaude } from "@/lib/api/health";
import { lerFiltros } from "@/lib/indicadores";
import { GET as getHealth } from "@/app/api/health/route";
import nextConfig, { CABECALHOS_DE_SEGURANCA } from "../next.config";

// Infraestrutura da API (PRD da Etapa 3, seções 7.1 e 7.4): handlers chamados diretamente, sem servidor.

const URL_BASE = "http://localhost/api/teste";

const limitesDeTeste = { RATE_LIMIT_AGENTE_MINUTO: 2, RATE_LIMIT_AGENTE_DIA: 3, RATE_LIMIT_FEEDBACK_MINUTO: 2, RATE_LIMIT_INDICADORES_MINUTO: 2 };

async function codigoDoErro(promessa: Promise<unknown>): Promise<string> {
  const erro = await promessa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(erro).toBeInstanceOf(ErroApi);
  return (erro as ErroApi).codigo;
}

function post(corpo: BodyInit | null, cabecalhos: Record<string, string> = { "content-type": "application/json" }) {
  return new Request(URL_BASE, { method: "POST", body: corpo, headers: cabecalhos, duplex: "half" } as RequestInit);
}

// Stream em pedaços, sem content-length (como um cliente que mente ou não declara o tamanho).
function corpoEmPedacos(totalBytes: number, pedaco = 1024): ReadableStream<Uint8Array> {
  let enviados = 0;
  return new ReadableStream({
    pull(controller) {
      if (enviados >= totalBytes) return controller.close();
      const tamanho = Math.min(pedaco, totalBytes - enviados);
      enviados += tamanho;
      controller.enqueue(new TextEncoder().encode("a".repeat(tamanho)));
    },
  });
}

describe("erros padronizados", () => {
  it.each(Object.entries(ERROS))("%s responde com o status e o formato do PRD", async (codigo, { status }) => {
    const resposta = respostaDeErro(new ErroApi(codigo as keyof typeof ERROS), "req-1");
    expect(resposta.status).toBe(status);
    const corpo = (await resposta.json()) as CorpoErro;
    expect(corpo).toEqual({ erro: { codigo, mensagem: expect.any(String), requestId: "req-1" } });
    expect(resposta.headers.get("cache-control")).toBe("no-store");
  });

  it("os status são os do PRD", () => {
    expect(Object.fromEntries(Object.entries(ERROS).map(([codigo, { status }]) => [codigo, status]))).toEqual({
      ENTRADA_INVALIDA: 400,
      CORPO_GRANDE: 413,
      TIPO_NAO_SUPORTADO: 415,
      LIMITE_EXCEDIDO: 429,
      OCUPADO: 503,
      TEMPO_ESGOTADO: 504,
      ERRO_INTERNO: 500,
    });
  });
});

describe("leitura do corpo JSON", () => {
  const esquema = z.object({ pergunta: z.string().min(1) });

  it("lê um corpo válido", async () => {
    await expect(lerCorpoJson(post(JSON.stringify({ pergunta: "receita?" })), esquema)).resolves.toEqual({ pergunta: "receita?" });
  });

  it("aceita application/json com charset", async () => {
    const request = post(JSON.stringify({ pergunta: "x" }), { "content-type": "application/json; charset=utf-8" });
    await expect(lerCorpoJson(request, esquema)).resolves.toEqual({ pergunta: "x" });
  });

  it.each([
    ["sem content-type", {}],
    ["text/plain", { "content-type": "text/plain" }],
    ["form", { "content-type": "application/x-www-form-urlencoded" }],
  ])("recusa %s com TIPO_NAO_SUPORTADO", async (_nome, cabecalhos) => {
    expect(await codigoDoErro(lerCorpoJson(post('{"pergunta":"x"}', cabecalhos), esquema))).toBe("TIPO_NAO_SUPORTADO");
  });

  it("recusa corpo acima de 8 KB lendo o stream (sem content-length)", async () => {
    expect(await codigoDoErro(lerCorpoJson(post(corpoEmPedacos(LIMITE_CORPO_BYTES + 1)), esquema))).toBe("CORPO_GRANDE");
  });

  it("recusa corpo grande mesmo com content-length falso (pequeno)", async () => {
    const request = post(corpoEmPedacos(20 * 1024), { "content-type": "application/json", "content-length": "10" });
    expect(await codigoDoErro(lerCorpoJson(request, esquema))).toBe("CORPO_GRANDE");
  });

  it("recusa antes de ler quando o content-length já passa do limite", async () => {
    const request = post("{}", { "content-type": "application/json", "content-length": String(LIMITE_CORPO_BYTES + 1) });
    expect(await codigoDoErro(lerCorpoJson(request, esquema))).toBe("CORPO_GRANDE");
  });

  it("aceita exatamente 8 KB", async () => {
    const texto = JSON.stringify({ pergunta: "a".repeat(LIMITE_CORPO_BYTES - '{"pergunta":""}'.length) });
    expect(new TextEncoder().encode(texto).byteLength).toBe(LIMITE_CORPO_BYTES);
    await expect(lerCorpoJson(post(texto), esquema)).resolves.toHaveProperty("pergunta");
  });

  it.each([
    ["JSON inválido", "{pergunta:"],
    ["corpo vazio", ""],
    ["UTF-8 inválido", new Uint8Array([0x7b, 0xff, 0x7d])],
  ])("recusa %s com ENTRADA_INVALIDA", async (_nome, corpo) => {
    expect(await codigoDoErro(lerCorpoJson(post(corpo as BodyInit), esquema))).toBe("ENTRADA_INVALIDA");
  });

  it("fora do schema: cita o campo, nunca o valor recebido", async () => {
    const erro = await lerCorpoJson(post(JSON.stringify({ pergunta: 42, segredo: "<script>" })), esquema).catch((e: ErroApi) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect((erro as ErroApi).codigo).toBe("ENTRADA_INVALIDA");
    expect((erro as ErroApi).message).toBe("Campos inválidos: pergunta.");
  });
});

describe("rate limit", () => {
  it("janela deslizante: libera de novo quando o registro mais antigo sai da janela", () => {
    const janela = new JanelaDeslizante(2, 60_000);
    janela.registrar("a", 0);
    janela.registrar("a", 10_000);
    expect(janela.esperaMs("a", 20_000)).toBe(40_000);
    expect(janela.esperaMs("b", 20_000)).toBe(0);
    expect(janela.esperaMs("a", 60_001)).toBe(0);
  });

  it("recusa acima do limite por minuto, com Retry-After em segundos", () => {
    const conjunto = criarLimitadores(limitesDeTeste);
    expect(consumirLimite("indicadores", "ip", 0, conjunto)).toEqual({ ok: true });
    expect(consumirLimite("indicadores", "ip", 1_000, conjunto)).toEqual({ ok: true });
    expect(consumirLimite("indicadores", "ip", 2_000, conjunto)).toEqual({ ok: false, retryAfterSeg: 58 });
    expect(consumirLimite("indicadores", "outro", 2_000, conjunto)).toEqual({ ok: true });
    expect(consumirLimite("indicadores", "ip", 60_001, conjunto)).toEqual({ ok: true });
  });

  it("agente: o limite diário vale mesmo com o do minuto livre", () => {
    const conjunto = criarLimitadores(limitesDeTeste);
    const minuto = 60_000;
    expect(consumirLimite("agente", "ip", 0, conjunto).ok).toBe(true);
    expect(consumirLimite("agente", "ip", 2 * minuto, conjunto).ok).toBe(true);
    expect(consumirLimite("agente", "ip", 4 * minuto, conjunto).ok).toBe(true);
    const recusa = consumirLimite("agente", "ip", 6 * minuto, conjunto);
    expect(recusa.ok).toBe(false);
    if (!recusa.ok) expect(recusa.retryAfterSeg).toBeGreaterThan(23 * 60 * 60);
  });

  it("uma recusa não consome vaga de nenhuma janela", () => {
    const conjunto = criarLimitadores({ ...limitesDeTeste, RATE_LIMIT_AGENTE_MINUTO: 1, RATE_LIMIT_AGENTE_DIA: 2 });
    expect(consumirLimite("agente", "ip", 0, conjunto).ok).toBe(true);
    for (let i = 1; i <= 5; i++) expect(consumirLimite("agente", "ip", i * 1_000, conjunto).ok).toBe(false);
    expect(consumirLimite("agente", "ip", 61_000, conjunto).ok).toBe(true);
  });

  it("categorias são independentes", () => {
    const conjunto = criarLimitadores(limitesDeTeste);
    consumirLimite("feedback", "ip", 0, conjunto);
    consumirLimite("feedback", "ip", 0, conjunto);
    expect(consumirLimite("feedback", "ip", 0, conjunto).ok).toBe(false);
    expect(consumirLimite("indicadores", "ip", 0, conjunto).ok).toBe(true);
  });

  it("sem TRUST_PROXY, o x-forwarded-for é ignorado (chave fixa)", () => {
    const request = new Request(URL_BASE, { headers: { "x-forwarded-for": "1.2.3.4" } });
    expect(chaveDoCliente(request, false)).toBe("local");
  });

  it("com TRUST_PROXY, vale o último endereço (o que o proxy acrescentou)", () => {
    expect(chaveDoCliente(new Request(URL_BASE, { headers: { "x-forwarded-for": "9.9.9.9, 1.2.3.4" } }), true)).toBe("1.2.3.4");
    expect(chaveDoCliente(new Request(URL_BASE), true)).toBe("desconhecido");
  });
});

describe("handler comum", () => {
  function rota(executar: Parameters<typeof criarRota>[0]["executar"], limite: "indicadores" | null = null) {
    const logs: EntradaLog[] = [];
    const handler = criarRota({ rota: "/api/teste", limite, executar, limitadores: criarLimitadores(limitesDeTeste), registrarLog: (e) => logs.push(e) });
    return { handler, logs };
  }

  it("devolve o x-request-id e registra uma linha de log", async () => {
    const { handler, logs } = rota(({ log }) => {
      log.categoria = "ANALISE_VENDAS";
      return Response.json({ ok: true });
    });
    const resposta = await handler(new Request(URL_BASE));
    const requestId = resposta.headers.get("x-request-id");
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(logs).toEqual([
      { requestId, rota: "/api/teste", metodo: "GET", status: 200, duracaoMs: expect.any(Number), categoria: "ANALISE_VENDAS" },
    ]);
  });

  it("cada requisição tem um requestId diferente", async () => {
    const { handler } = rota(() => new Response(null, { status: 204 }));
    const ids = await Promise.all([1, 2, 3].map(async () => (await handler(new Request(URL_BASE))).headers.get("x-request-id")));
    expect(new Set(ids).size).toBe(3);
  });

  it("ErroApi vira a resposta do código, com o mesmo requestId no corpo e no cabeçalho", async () => {
    const { handler } = rota(() => {
      throw new ErroApi("ENTRADA_INVALIDA", "Parâmetros inválidos: fim: data.");
    });
    const resposta = await handler(new Request(URL_BASE));
    const corpo = (await resposta.json()) as CorpoErro;
    expect(resposta.status).toBe(400);
    expect(corpo.erro).toEqual({ codigo: "ENTRADA_INVALIDA", mensagem: "Parâmetros inválidos: fim: data.", requestId: resposta.headers.get("x-request-id") });
  });

  it("exceção inesperada vira ERRO_INTERNO sem mensagem, stack nem SQL", async () => {
    const { handler, logs } = rota(() => {
      throw new Error("SqliteError: no such column: cpf in SELECT cpf FROM cliente");
    });
    const resposta = await handler(new Request(URL_BASE));
    const texto = await resposta.text();
    expect(resposta.status).toBe(500);
    expect(JSON.parse(texto).erro.codigo).toBe("ERRO_INTERNO");
    for (const proibido of ["Sqlite", "cpf", "SELECT", "at "]) expect(texto).not.toContain(proibido);
    expect(logs[0]).toMatchObject({ status: 500, erroInterno: "Error" });
    expect(JSON.stringify(logs)).not.toContain("SELECT");
  });

  it("aplica o rate limit com 429 e Retry-After, sem executar a rota", async () => {
    const executar = vi.fn(() => Response.json({ ok: true }));
    const { handler } = rota(executar, "indicadores");
    await handler(new Request(URL_BASE));
    await handler(new Request(URL_BASE));
    const resposta = await handler(new Request(URL_BASE));
    expect(resposta.status).toBe(429);
    expect(Number(resposta.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(((await resposta.json()) as CorpoErro).erro.codigo).toBe("LIMITE_EXCEDIDO");
    expect(executar).toHaveBeenCalledTimes(2);
  });

  it("o log nunca leva o corpo da requisição nem a resposta", async () => {
    const { handler, logs } = rota(async ({ request }) => Response.json({ eco: await lerCorpoJson(request, z.object({ pergunta: z.string() })) }));
    await handler(post(JSON.stringify({ pergunta: "PERGUNTA-SECRETA" })));
    expect(JSON.stringify(logs)).not.toContain("PERGUNTA-SECRETA");
  });

  it("lerConsulta: filtros válidos passam; inválidos viram ENTRADA_INVALIDA sem ecoar o valor", async () => {
    const { handler } = rota(({ request }) => Response.json(lerConsulta(request, lerFiltros).filtros));
    const ok = await handler(new Request(`${URL_BASE}?fim=2026-09-30&regiao=SUL`));
    expect(await ok.json()).toEqual({ inicio: "2025-10-01", fim: "2026-09-30", regiao: "SUL" });

    const recusa = await handler(new Request(`${URL_BASE}?regiao=${encodeURIComponent("<script>")}`));
    const texto = await recusa.text();
    expect(recusa.status).toBe(400);
    expect(texto).toContain("regiao");
    expect(texto).not.toContain("<script>");
  });
});

describe("rota /api/health", () => {
  it("responde só os 4 campos do PRD, com x-request-id e sem cache", async () => {
    const resposta = await getHealth(new Request("http://localhost/api/health"));
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    const corpo = await resposta.json();
    expect(Object.keys(corpo).sort()).toEqual(["agente", "banco", "langsmith", "status"]);
    expect(corpo).toMatchObject({ status: "ok", banco: "ok" });
    expect(["real", "fake"]).toContain(corpo.agente);
    expect(typeof corpo.langsmith).toBe("boolean");
  });

  it("banco indisponível: status e banco 'erro', sem a mensagem do erro", () => {
    const quebrado = {
      prepare(): never {
        throw new Error("SQLITE_CANTOPEN: C:\caminho\secreto\vendas.db");
      },
    };
    const saude = verificarSaude(quebrado);
    expect(saude).toMatchObject({ status: "erro", banco: "erro" });
    expect(JSON.stringify(saude)).not.toMatch(/SQLITE|caminho|vendas\.db/);
  });
});

describe("runtime das rotas", () => {
  // O Node.js é o padrão do Next 16; com cacheComponents, `runtime` e `dynamic` são recusados (PRD 7.1).
  it("toda rota roda no Node.js: nenhuma exporta runtime/dynamic nem usa edge", () => {
    const rotas = readdirSync("src/app", { recursive: true, encoding: "utf8" }).filter((arquivo) => /(^|[\\/])route\.ts$/.test(arquivo));
    expect(rotas.length).toBeGreaterThan(0);
    for (const rota of rotas) {
      const codigo = readFileSync(join("src/app", rota), "utf8");
      expect(codigo, rota).not.toMatch(/^\s*export\s+const\s+(runtime|dynamic)\b/m);
      expect(codigo, rota).not.toMatch(/["']edge["']/);
    }
  });
});

describe("cabeçalhos de segurança (next.config.ts)", () => {
  const valor = (chave: string) => CABECALHOS_DE_SEGURANCA.find((c) => c.key === chave)?.value ?? "";

  it("valem para todas as rotas", async () => {
    const regras = await nextConfig.headers!();
    expect(regras).toEqual([{ source: "/:path*", headers: CABECALHOS_DE_SEGURANCA }]);
  });

  it("têm os valores do PRD", () => {
    expect(valor("X-Content-Type-Options")).toBe("nosniff");
    expect(valor("Referrer-Policy")).toBe("no-referrer");
    expect(valor("X-Frame-Options")).toBe("DENY");
    expect(valor("Permissions-Policy")).toContain("camera=()");
    expect(valor("Content-Security-Policy")).toContain("default-src 'self'");
    expect(valor("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("fora do desenvolvimento, a CSP não tem 'unsafe-eval'", () => {
    expect(process.env.NODE_ENV).not.toBe("development");
    expect(valor("Content-Security-Policy")).not.toContain("unsafe-eval");
  });

  it("não expõe o X-Powered-By", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
