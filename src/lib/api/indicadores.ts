import "server-only";
import { lerFiltros, lerFiltrosRanking, type Filtros } from "../indicadores";
import { ErroApi } from "./errors";
import { criarRota, lerConsulta } from "./handler";

// Fábricas das rotas de indicadores e filtros (PRD da Etapa 3, seção 7.3). Cada route.ts só liga
// o nome da rota à função da camada de indicadores. Os dados não mudam durante a execução: as
// respostas de sucesso podem ficar 60 s no cache do navegador (as de erro seguem com no-store).

const CACHE = "private, max-age=60";

// Resposta: os filtros com os padrões já aplicados (a tela mostra o período usado) e os dados.
export function rotaDeIndicador<T>(nome: string, calcular: (filtros: Filtros) => T) {
  return criarRota({
    rota: `/api/indicadores/${nome}`,
    limite: "indicadores",
    executar: ({ request }) => {
      const { filtros } = lerConsulta(request, lerFiltros);
      return Response.json({ filtros, dados: calcular(filtros) }, { headers: { "cache-control": CACHE } });
    },
  });
}

export function rotaDeRanking<T>(nome: string, calcular: (filtros: Filtros, limite: number) => T) {
  return criarRota({
    rota: `/api/indicadores/${nome}`,
    limite: "indicadores",
    executar: ({ request }) => {
      const { filtros, limite } = lerConsulta(request, lerFiltrosRanking);
      return Response.json({ filtros, limite, dados: calcular(filtros, limite) }, { headers: { "cache-control": CACHE } });
    },
  });
}

// GET /api/filtros: sem parâmetros (qualquer um é recusado, como nos demais schemas estritos).
export function rotaDeOpcoes<T>(calcular: () => T) {
  return criarRota({
    rota: "/api/filtros",
    limite: "indicadores",
    executar: ({ request }) => {
      const parametros = [...new URL(request.url).searchParams.keys()];
      if (parametros.length > 0) {
        throw new ErroApi("ENTRADA_INVALIDA", `Parâmetros inválidos: esta rota não aceita parâmetros (${[...new Set(parametros)].join(", ")}).`);
      }
      return Response.json(calcular(), { headers: { "cache-control": CACHE } });
    },
  });
}
