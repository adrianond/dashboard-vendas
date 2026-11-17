import { rotaDeIndicador } from "@/lib/api/indicadores";
import { porTipoVeiculo } from "@/lib/indicadores";

// GET /api/indicadores/por-tipo-veiculo (PRD da Etapa 3, seções 6.3 e 7.3).
export const GET = rotaDeIndicador("por-tipo-veiculo", porTipoVeiculo);
