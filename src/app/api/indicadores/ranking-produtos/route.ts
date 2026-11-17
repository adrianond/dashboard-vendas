import { rotaDeRanking } from "@/lib/api/indicadores";
import { rankingProdutos } from "@/lib/indicadores";

// GET /api/indicadores/ranking-produtos (PRD da Etapa 3, seções 6.3 e 7.3).
export const GET = rotaDeRanking("ranking-produtos", rankingProdutos);
