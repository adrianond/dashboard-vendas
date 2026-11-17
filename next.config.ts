import type { NextConfig } from "next";

// Cabeçalhos de segurança em todas as respostas (PRD da Etapa 3, seção 7.1). A CSP é a inicial:
// 'unsafe-inline' cobre os scripts e estilos inline do Next até a Etapa 4 adotar nonce, e
// 'unsafe-eval' só existe em desenvolvimento (hot reload).
const desenvolvimento = process.env.NODE_ENV === "development";

export const POLITICA_DE_CONTEUDO = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${desenvolvimento ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const CABECALHOS_DE_SEGURANCA = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Content-Security-Policy", value: POLITICA_DE_CONTEUDO },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  cacheComponents: true,
  partialPrefetching: true,
  // Sem X-Powered-By: a API não expõe versões.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: CABECALHOS_DE_SEGURANCA }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
