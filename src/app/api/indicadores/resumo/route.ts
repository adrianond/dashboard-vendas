import { rotaDeIndicador } from "@/lib/api/indicadores";
import { resumo } from "@/lib/indicadores";

// GET /api/indicadores/resumo (PRD da Etapa 3, seções 6.3 e 7.3).
export const GET = rotaDeIndicador("resumo", resumo);
