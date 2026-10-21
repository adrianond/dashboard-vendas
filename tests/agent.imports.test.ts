import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Camada 1 de segurança (CLAUDE.md, seção 4): nenhum arquivo do agente alcança a conexão de
// escrita, nem direta nem indiretamente. Percorre o grafo de imports do próprio projeto
// (caminhos relativos e o alias "@/"); pacotes externos não são seguidos.

const RAIZ = process.cwd();
const PASTA_DO_AGENTE = path.join(RAIZ, "src/lib/agent");
const CLIENTE_DE_ESCRITA = path.join(RAIZ, "src/lib/db/client.ts");
const CLIENTE_DE_LEITURA = path.join(RAIZ, "src/lib/db/readonly-client.ts");
const EXTENSOES = [".ts", ".tsx", "/index.ts", "/index.tsx"];

function arquivosTs(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true, recursive: true })
    .filter((item) => item.isFile() && /\.tsx?$/.test(item.name))
    .map((item) => path.join(item.parentPath, item.name));
}

function resolverImport(especificador: string, arquivoDeOrigem: string): string | undefined {
  let base: string;
  if (especificador.startsWith("@/")) base = path.join(RAIZ, "src", especificador.slice(2));
  else if (especificador.startsWith(".")) base = path.resolve(path.dirname(arquivoDeOrigem), especificador);
  else return undefined;
  return [base, ...EXTENSOES.map((extensao) => base + extensao)].find(
    (candidato) => /\.tsx?$/.test(candidato) && existsSync(candidato),
  );
}

function alcancaveisAPartirDe(inicio: string): Set<string> {
  const visitados = new Set<string>();
  const pendentes = [inicio];
  while (pendentes.length > 0) {
    const arquivo = pendentes.pop()!;
    if (visitados.has(arquivo)) continue;
    visitados.add(arquivo);
    const { importedFiles } = ts.preProcessFile(readFileSync(arquivo, "utf8"), true, true);
    for (const { fileName } of importedFiles) {
      const destino = resolverImport(fileName, arquivo);
      if (destino) pendentes.push(destino);
    }
  }
  return visitados;
}

const arquivosDoAgente = arquivosTs(PASTA_DO_AGENTE);

describe("imports do agente (src/lib/agent)", () => {
  it("encontra os arquivos do agente", () => {
    expect(arquivosDoAgente.length).toBeGreaterThan(0);
  });

  it.each(arquivosDoAgente.map((arquivo) => [path.relative(RAIZ, arquivo), arquivo]))(
    "%s não alcança src/lib/db/client.ts",
    (_nome, arquivo) => {
      expect(alcancaveisAPartirDe(arquivo).has(CLIENTE_DE_ESCRITA)).toBe(false);
    },
  );

  // Garante que o teste não passa no vazio: o grafo é de fato percorrido até a camada de banco.
  it("o processo filho do executor alcança readonly-client.ts", () => {
    const worker = path.join(PASTA_DO_AGENTE, "sql/executor-worker.ts");
    expect(alcancaveisAPartirDe(worker).has(CLIENTE_DE_LEITURA)).toBe(true);
  });
});
