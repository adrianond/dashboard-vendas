import { rotaDeIndicador } from "@/lib/api/indicadores";
import { serieMensal } from "@/lib/indicadores";

// GET /api/indicadores/serie-mensal (PRD da Etapa 3, seções 6.3 e 7.3).
export const GET = rotaDeIndicador("serie-mensal", serieMensal);
