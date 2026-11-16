import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Fora do Next, `import "server-only"` lança erro; nos testes, aponta para o módulo vazio do
      // próprio pacote (PRD da Etapa 3, seção 6.1). Caminho de arquivo: o "exports" do pacote não
      // expõe o empty.js por subcaminho.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
