import { rotaDeIndicador } from "@/lib/api/indicadores";
import { porUnidade } from "@/lib/indicadores";

// GET /api/indicadores/por-unidade (PRD da Etapa 3, seções 6.3 e 7.3).
export const GET = rotaDeIndicador("por-unidade", porUnidade);
