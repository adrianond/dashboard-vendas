import { readonlyDb } from "../../db/readonly-client";
import type { Linha, MensagemDoWorker, PedidoAoWorker, RespostaDoWorker } from "./executor";

// Processo filho do executor (PRD da Etapa 2, seção 9): abre a própria conexão somente leitura,
// executa UMA query e responde ao pai pelo IPC. O pai o mata no timeout.

const enviar = (mensagem: MensagemDoWorker) => process.send?.(mensagem);

process.once("message", ({ sql }: PedidoAoWorker) => {
  enviar(executar(sql));
});
enviar({ tipo: "pronto" });

function executar(sql: string): RespostaDoWorker {
  try {
    const consulta = readonlyDb.prepare(sql);
    // Defesa em profundidade: o validador já exigiu readonly; o executor confere de novo.
    if (!consulta.readonly) return { tipo: "erro", erro: "a query não é somente leitura" };
    // Inteiros chegam como BigInt, sem perder precisão; a conversão fica em converterValor.
    consulta.safeIntegers(true);
    const colunas = consulta.columns().map((coluna) => coluna.name);
    const linhas = (consulta.all() as Linha[]).map(converterLinha);
    return { tipo: "resultado", colunas, linhas };
  } catch (erro) {
    return { tipo: "erro", erro: erro instanceof Error ? erro.message : String(erro) };
  }
}

function converterLinha(linha: Linha): Linha {
  return Object.fromEntries(Object.entries(linha).map(([coluna, valor]) => [coluna, converterValor(valor)]));
}

// O IPC serializa em JSON: BigInt vira número quando cabe sem perda, senão texto; BLOB vira descrição.
function converterValor(valor: unknown): unknown {
  if (typeof valor === "bigint") {
    const numero = Number(valor);
    return Number.isSafeInteger(numero) ? numero : valor.toString();
  }
  if (Buffer.isBuffer(valor)) return `<BLOB ${valor.length} bytes>`;
  return valor;
}
