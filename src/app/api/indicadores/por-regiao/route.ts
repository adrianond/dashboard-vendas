import { rotaDeIndicador } from "@/lib/api/indicadores";
import { porRegiao } from "@/lib/indicadores";

// GET /api/indicadores/por-regiao (PRD da Etapa 3, seções 6.3 e 7.3).
export const GET = rotaDeIndicador("por-regiao", porRegiao);
