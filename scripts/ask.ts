import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { configPadrao } from "../src/lib/agent/config";
import { createAgent, criarModelosAnthropic, perguntarComRastreamento } from "../src/lib/agent";
import { modelosDaConfig } from "../src/lib/agent/observabilidade";

// CLI do agente (PRD da Etapa 2, seção 10.3). Várias perguntas na mesma execução compartilham o
// thread: o checkpointer (MemorySaver) só vive enquanto o processo roda.
//   npm run agent:ask -- "qual a receita por região em 2025?"
//   npm run agent:ask -- --thread t1 "receita de SUVs em 2025" "e em 2024?"

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    options: { thread: { type: "string" } },
    allowPositionals: true,
  });

  if (positionals.length === 0) {
    console.error('Uso: npm run agent:ask -- [--thread <id>] "pergunta" ["pergunta de acompanhamento" ...]');
    return 1;
  }

  const threadId = values.thread ?? `cli-${randomUUID()}`;
  const agente = createAgent({ modelos: criarModelosAnthropic(configPadrao) });
  const modelos = modelosDaConfig(configPadrao);

  for (const pergunta of positionals) {
    const { resultado, estado, urlDoTrace } = await perguntarComRastreamento(agente, { pergunta, threadId }, modelos);
    console.log(`\n▶ ${pergunta}`);
    console.log(`Status:      ${resultado.status}`);
    console.log(`Resposta:    ${resultado.resposta}`);
    console.log(`SQL:         ${resultado.sqlExecutado ?? "(nenhum)"}`);
    console.log(`Linhas:      ${resultado.linhas.length}${resultado.truncado ? " (truncado)" : ""}`);
    console.log(`Tentativas:  ${estado.tentativas}`);
    console.log("Guardrails:");
    for (const guardrail of estado.guardrails) {
      console.log(`  ${guardrail.aprovado ? "✓" : "✗"} ${guardrail.etapa}: ${guardrail.motivo}`);
    }
    console.log(`Trace:       ${urlDoTrace ?? "(sem rastreamento)"}`);
  }
  console.log(`\nThread: ${threadId}`);
  return 0;
}

main().then(
  (codigo) => process.exit(codigo),
  (erro: unknown) => {
    // Só a mensagem: sem stack trace nem configuração.
    console.error(`Erro: ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exit(1);
  },
);
