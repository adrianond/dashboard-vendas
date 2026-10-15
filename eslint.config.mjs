import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Camada 1 de segurança (CLAUDE.md, seção 4): o agente só acessa o banco pelo
  // readonly-client.ts. Bloqueia a conexão de escrita, o seed e a abertura direta do SQLite.
  {
    files: ["src/lib/agent/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/db/client", "**/db/client.ts", "**/db/seed", "**/db/seed/**"],
              message: "O agente só pode usar src/lib/db/readonly-client.ts (CLAUDE.md, seção 4).",
            },
            {
              group: ["better-sqlite3", "drizzle-orm/better-sqlite3"],
              allowTypeImports: true,
              message: "O agente não abre conexões próprias: use src/lib/db/readonly-client.ts.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
