import { criarRota } from "@/lib/api/handler";
import { verificarSaude } from "@/lib/api/health";

// GET /api/health (PRD da Etapa 3, seção 7.3). Os demais métodos recebem 405 do próprio Next.
// Sem `export const runtime`: o Node.js é o runtime padrão, e com cacheComponents o Next recusa esse
// export (tests/api.unit.test.ts garante que nenhuma rota o declara nem usa edge).

export const GET = criarRota({
  rota: "/api/health",
  limite: "indicadores",
  executar: () => {
    const saude = verificarSaude();
    return Response.json(saude, { status: saude.banco === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } });
  },
});
