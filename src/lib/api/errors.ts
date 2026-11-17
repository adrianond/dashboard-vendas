import "server-only";

// Erros padronizados da API (PRD da Etapa 3, seção 7.1). A mensagem é sempre amigável e nunca traz
// stack trace, mensagem do banco ou SQL.

export const ERROS = {
  ENTRADA_INVALIDA: { status: 400, mensagem: "A requisição tem dados inválidos." },
  CORPO_GRANDE: { status: 413, mensagem: "O corpo da requisição é grande demais." },
  TIPO_NAO_SUPORTADO: { status: 415, mensagem: "Envie o corpo da requisição como application/json." },
  LIMITE_EXCEDIDO: { status: 429, mensagem: "Muitas requisições em pouco tempo. Tente novamente em instantes." },
  OCUPADO: { status: 503, mensagem: "O assistente está ocupado. Tente novamente em instantes." },
  TEMPO_ESGOTADO: { status: 504, mensagem: "A requisição demorou demais. Tente novamente." },
  ERRO_INTERNO: { status: 500, mensagem: "Ocorreu um erro interno. Tente novamente mais tarde." },
} as const;

export type CodigoErro = keyof typeof ERROS;

export class ErroApi extends Error {
  constructor(
    readonly codigo: CodigoErro,
    mensagem: string = ERROS[codigo].mensagem,
    readonly cabecalhos: Record<string, string> = {},
  ) {
    super(mensagem);
    this.name = "ErroApi";
  }

  get status(): number {
    return ERROS[this.codigo].status;
  }
}

export type CorpoErro = { erro: { codigo: CodigoErro; mensagem: string; requestId: string } };

export function respostaDeErro(erro: ErroApi, requestId: string): Response {
  const corpo: CorpoErro = { erro: { codigo: erro.codigo, mensagem: erro.message, requestId } };
  return Response.json(corpo, { status: erro.status, headers: { ...erro.cabecalhos, "cache-control": "no-store" } });
}
