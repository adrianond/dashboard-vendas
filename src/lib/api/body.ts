import "server-only";
import type { z } from "zod";
import { ErroApi } from "./errors";

// Corpo JSON de POST (PRD da Etapa 3, seção 7.1): application/json obrigatório e no máximo 8 KB,
// contados na leitura do stream (o content-length só antecipa a recusa; não é confiável).

export const LIMITE_CORPO_BYTES = 8 * 1024;

async function lerComLimite(corpo: ReadableStream<Uint8Array> | null, limite: number): Promise<Uint8Array> {
  if (!corpo) return new Uint8Array();
  const leitor = corpo.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await leitor.cancel();
      throw new ErroApi("CORPO_GRANDE");
    }
    partes.push(value);
  }
  const bytes = new Uint8Array(total);
  let posicao = 0;
  for (const parte of partes) {
    bytes.set(parte, posicao);
    posicao += parte.byteLength;
  }
  return bytes;
}

// As mensagens citam só os campos com problema, nunca o conteúdo recebido.
export async function lerCorpoJson<T extends z.ZodType>(
  request: Request,
  esquema: T,
  limite: number = LIMITE_CORPO_BYTES,
): Promise<z.output<T>> {
  const tipo = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (tipo !== "application/json") throw new ErroApi("TIPO_NAO_SUPORTADO");

  const declarado = Number(request.headers.get("content-length") ?? "0");
  if (declarado > limite) throw new ErroApi("CORPO_GRANDE");

  const bytes = await lerComLimite(request.body, limite);
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ErroApi("ENTRADA_INVALIDA", "O corpo da requisição não é um JSON válido.");
  }

  const resultado = esquema.safeParse(json);
  if (!resultado.success) {
    const campos = [...new Set(resultado.error.issues.map((problema) => problema.path.join(".") || "(corpo)"))];
    throw new ErroApi("ENTRADA_INVALIDA", `Campos inválidos: ${campos.join(", ")}.`);
  }
  return resultado.data;
}
