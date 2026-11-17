import { rotaDeIndicador } from "@/lib/api/indicadores";
import { funil } from "@/lib/indicadores";

// GET /api/indicadores/funil (PRD da Etapa 3, seções 6.3 e 7.3).
export const GET = rotaDeIndicador("funil", funil);
