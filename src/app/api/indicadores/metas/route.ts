import { rotaDeIndicador } from "@/lib/api/indicadores";
import { metas } from "@/lib/indicadores";

// GET /api/indicadores/metas (PRD da Etapa 3, seções 6.3 e 7.3).
export const GET = rotaDeIndicador("metas", metas);
