import { Parser, type AST } from "node-sql-parser";
import { readonlyDb } from "../../db/readonly-client";
import { ALLOWED_VIEWS } from "../../db/views";

// Camada 3 de segurança (PRD da Etapa 2, seção 8): valida o SQL gerado pelo LLM pela AST do
// node-sql-parser, sem regex como controle principal. As regras rodam na ordem do PRD e a primeira
// falha encerra. Na dúvida, reprova (falha fechada). O motivo é técnico, vai para o nó de
// correção e nunca chega ao usuário.

export type ResultadoValidacao = { ok: true; sqlNormalizado: string } | { ok: false; motivo: string };

// Prepara a query sem executar (regra 9). Injetável para os testes.
export type PrepararSql = (sql: string) => { readonly: boolean };

const MAX_SQL_CHARS = 5000;
const DIALETO = { database: "sqlite" };

const VIEWS_PERMITIDAS: ReadonlySet<string> = new Set(ALLOWED_VIEWS);
const TABELAS_DE_SISTEMA = new Set(["sqlite_master", "sqlite_schema", "sqlite_temp_master", "sqlite_sequence"]);
const FUNCOES_PERMITIDAS = new Set([
  "count", "sum", "total", "avg", "min", "max", "round", "abs", "coalesce", "ifnull", "nullif", "iif",
  "cast", "strftime", "date", "julianday", "upper", "lower", "trim", "substr", "length", "replace",
  "printf", "group_concat",
  // Funções de janela
  "row_number", "rank", "dense_rank", "lag", "lead",
]);
const DICA_JANELA =
  "funções de janela exigem OVER (PARTITION BY ... ORDER BY ...); para todas as linhas, use PARTITION BY 1";

const parser = new Parser();

type No = Record<string, unknown>;
type Referencia = { nome: string; schema: string | null };
type Consulta = { ast: No; tabelasDoParser: Referencia[]; sqlNormalizado: string };
type Analise = { ok: true; consulta: Consulta } | { ok: false; motivo: string };

const ehNo = (valor: unknown): valor is No => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const reprovar = (motivo: string) => ({ ok: false as const, motivo });

export function validarSql(
  sql: string,
  preparar: PrepararSql = (texto) => readonlyDb.prepare(texto),
): ResultadoValidacao {
  const motivoDoTexto = verificarTexto(sql);
  if (motivoDoTexto) return reprovar(motivoDoTexto);

  const analise = analisar(sql);
  if (!analise.ok) return analise;

  for (const regra of REGRAS_DA_AST) {
    const motivo = regra(analise.consulta);
    if (motivo) return reprovar(motivo);
  }

  const { sqlNormalizado } = analise.consulta;
  const motivoDoSqlite = verificarNoSqlite(sqlNormalizado, preparar);
  if (motivoDoSqlite) return reprovar(motivoDoSqlite);
  return { ok: true, sqlNormalizado };
}

// Regra 1
function verificarTexto(sql: string): string | undefined {
  if (sql.trim() === "") return "query vazia";
  if (sql.length > MAX_SQL_CHARS) return `query longa demais (${sql.length} caracteres; máximo ${MAX_SQL_CHARS})`;
  return undefined;
}

// Regras 2, 3 e 4. O sqlNormalizado é reconstruído da AST: sai sem comentários e sem ";".
function analisar(sql: string): Analise {
  let resultado: ReturnType<Parser["parse"]>;
  try {
    resultado = parser.parse(sql, DIALETO);
  } catch (erro) {
    return reprovar(motivoDeParse(sql, erro));
  }

  const instrucoes: unknown[] = Array.isArray(resultado.ast) ? resultado.ast : [resultado.ast];
  if (instrucoes.length !== 1) return reprovar(`envie exatamente uma instrução SQL (recebidas: ${instrucoes.length})`);

  const [instrucao] = instrucoes;
  if (!ehNo(instrucao) || instrucao.type !== "select") {
    const tipo = ehNo(instrucao) ? String(instrucao.type).toUpperCase() : "desconhecido";
    return reprovar(`apenas SELECT é permitido (recebido: ${tipo})`);
  }

  try {
    const sqlNormalizado = parser.sqlify(instrucao as unknown as AST, DIALETO).trim().replace(/;+$/, "").trim();
    return { ok: true, consulta: { ast: instrucao, tabelasDoParser: lerTableList(resultado.tableList), sqlNormalizado } };
  } catch (erro) {
    return reprovar(`não foi possível normalizar a query: ${mensagemDe(erro)}`);
  }
}

function motivoDeParse(sql: string, erro: unknown): string {
  const local = (erro as { location?: { start?: { line?: number; column?: number } } })?.location?.start;
  const encontrado = /but (.+) found/.exec(mensagemDe(erro))?.[1];
  const detalhe = local
    ? `erro de sintaxe na linha ${local.line}, coluna ${local.column}${encontrado ? ` (encontrado: ${encontrado})` : ""}`
    : mensagemDe(erro).slice(0, 200);
  const dica = /\bover\s*\(/i.test(sql) ? `; ${DICA_JANELA}` : "";
  return `o parser não entendeu a query (dialeto SQLite): ${detalhe}${dica}`;
}

// Regra 5. Duas travas: a AST percorrida com o escopo de cada WITH (um nome só é CTE onde ela é
// visível) e, como reforço, o tableList do parser (sem escopo; aceita apenas nomes de CTE).
function regraSoViewsPermitidas({ ast, tabelasDoParser }: Consulta): string | undefined {
  const ctes = nomesDeTodasAsCtes(ast);
  const referencias = [...referenciasForaDeCtes(ast, new Set()), ...tabelasDoParser.filter((t) => !ctes.has(t.nome))];
  return referencias.map(motivoDaTabela).find(Boolean);
}

function motivoDaTabela({ nome, schema }: Referencia): string | undefined {
  if (schema !== null) return `não qualifique tabelas com schema (${schema}.${nome}); use só o nome da view`;
  if (TABELAS_DE_SISTEMA.has(nome)) return `tabela de sistema não permitida: ${nome}`;
  if (VIEWS_PERMITIDAS.has(nome)) return undefined;
  const sugestao = VIEWS_PERMITIDAS.has(`vw_${nome}`)
    ? `use vw_${nome}`
    : `use apenas as views: ${ALLOWED_VIEWS.join(", ")}`;
  return `tabela não permitida: ${nome}; ${sugestao}`;
}

// Regra 6 (as tabelas sqlite_* já reprovam na regra 5, com motivo próprio).
function regraSemFuncoesPragma({ ast }: Consulta): string | undefined {
  const funcao = funcoesUsadas(ast).find((nome) => nome.startsWith("pragma_"));
  return funcao && `função de tabela não permitida: ${funcao}`;
}

// Regra 7
function regraSoFuncoesPermitidas({ ast }: Consulta): string | undefined {
  const funcao = funcoesUsadas(ast).find((nome) => !FUNCOES_PERMITIDAS.has(nome));
  return funcao && `função não permitida: ${funcao}; use apenas: ${[...FUNCOES_PERMITIDAS].join(", ")}`;
}

// Regra 8. Sem RECURSIVE, o SQLite também trata como recursiva a CTE que cita o próprio nome.
function regraSemCteRecursiva({ ast }: Consulta): string | undefined {
  const recursiva = ctesDe(ast).find(
    (cte) => cte.recursive === true || referenciasForaDeCtes(cte.stmt, new Set()).some((r) => r.nome === nomeDaCte(cte)),
  );
  return recursiva && `CTE recursiva não permitida: ${nomeDaCte(recursiva) ?? "(sem nome)"}`;
}

const REGRAS_DA_AST = [regraSoViewsPermitidas, regraSemFuncoesPragma, regraSoFuncoesPermitidas, regraSemCteRecursiva];

// Regra 9
function verificarNoSqlite(sql: string, preparar: PrepararSql): string | undefined {
  try {
    return preparar(sql).readonly ? undefined : "a query não é somente leitura (statement.readonly = false)";
  } catch (erro) {
    return `erro do SQLite ao preparar a query: ${mensagemDe(erro)}`;
  }
}

// --- Leitura da AST ---

function percorrer(valor: unknown, visitar: (no: No) => void): void {
  if (Array.isArray(valor)) {
    for (const item of valor) percorrer(item, visitar);
    return;
  }
  if (!ehNo(valor)) return;
  visitar(valor);
  for (const filho of Object.values(valor)) percorrer(filho, visitar);
}

// Nome ilegível vira texto fora da allowlist: a função reprova em vez de passar despercebida.
function funcoesUsadas(ast: No): string[] {
  const nomes: string[] = [];
  percorrer(ast, (no) => {
    if (no.type === "function" || no.type === "aggr_func") nomes.push(nomeDaFuncao(no));
  });
  return nomes;
}

function nomeDaFuncao(no: No): string {
  const partes = ehNo(no.name) && Array.isArray(no.name.name) ? no.name.name : [];
  const nome =
    typeof no.name === "string"
      ? no.name
      : partes.map((parte) => (ehNo(parte) && typeof parte.value === "string" ? parte.value : "")).join(".");
  return nome.toLowerCase() || "(nome ilegível)";
}

function ctesDe(ast: No): No[] {
  const ctes: No[] = [];
  percorrer(ast, (no) => {
    if (Array.isArray(no.with)) ctes.push(...no.with.filter(ehNo));
  });
  return ctes;
}

function nomesDeTodasAsCtes(ast: No): Set<string> {
  return new Set(ctesDe(ast).map(nomeDaCte).filter((nome): nome is string => nome !== undefined));
}

function nomeDaCte(cte: No): string | undefined {
  const nome = ehNo(cte.name) ? cte.name.value : cte.name;
  return typeof nome === "string" ? nome.toLowerCase() : undefined;
}

// Tabelas citadas no FROM/JOIN que não resolvem para uma CTE visível naquele ponto.
function referenciasForaDeCtes(valor: unknown, ctesVisiveis: ReadonlySet<string>): Referencia[] {
  if (Array.isArray(valor)) return valor.flatMap((item) => referenciasForaDeCtes(item, ctesVisiveis));
  if (!ehNo(valor)) return [];

  const referencias: Referencia[] = [];
  let escopo = ctesVisiveis;
  if (Array.isArray(valor.with)) {
    // Cada CTE enxerga as anteriores e a si mesma (autorreferência é recursão: regra 8).
    const ampliado = new Set(ctesVisiveis);
    for (const cte of valor.with.filter(ehNo)) {
      const nome = nomeDaCte(cte);
      if (nome) ampliado.add(nome);
      referencias.push(...referenciasForaDeCtes(cte.stmt, ampliado));
    }
    escopo = ampliado;
  }
  if (Array.isArray(valor.from)) referencias.push(...tabelasDoFrom(valor.from, escopo));
  for (const [chave, filho] of Object.entries(valor)) {
    if (chave !== "with") referencias.push(...referenciasForaDeCtes(filho, escopo));
  }
  return referencias;
}

function tabelasDoFrom(itens: unknown[], escopo: ReadonlySet<string>): Referencia[] {
  return itens.filter(ehNo).flatMap((item) => {
    if (typeof item.table !== "string") return [];
    const nome = item.table.toLowerCase();
    const schema = item.db == null ? null : String(item.db);
    return schema === null && escopo.has(nome) ? [] : [{ nome, schema }];
  });
}

// Formato do tableList: "<tipo>::<schema ou null>::<tabela>".
function lerTableList(lista: unknown): Referencia[] {
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((item): item is string => typeof item === "string")
    .map((item) => {
      const [, schema, nome = ""] = item.split("::");
      return { nome: nome.toLowerCase(), schema: !schema || schema === "null" ? null : schema };
    });
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
