import { rotaDeOpcoes } from "@/lib/api/indicadores";
import { opcoesFiltros } from "@/lib/indicadores";

// GET /api/filtros: opções dos seletores do dashboard (PRD da Etapa 3, seções 6.3 e 7.3).
export const GET = rotaDeOpcoes(opcoesFiltros);
