# Progresso

## Etapa 1 — Fundação e dados (PRD-etapa-01-fundacao-e-dados.md)

| Passo | Status | Commit |
|---|---|---|
| 1.0 Regras de trabalho do Claude Code | ✅ concluído | 99cd22e |
| 1.1 Setup do projeto | ✅ concluído | 99cd22e |
| 1.2 Schema e migrations | ✅ concluído | bef0c74 |
| 1.3 Seed das entidades de cadastro | ✅ concluído | 3a8843b |
| 1.4 Seed de propostas, vendas e metas | ✅ concluído | |
| 1.5 Verificação de integridade e testes | ⏳ próximo | |
| 1.6 Documentação do schema e fechamento | ⬜ | |

## Pendências
- Preencher o hash do commit do passo 1.4 na tabela acima (junto com o commit do passo 1.5).
- Passo 1.5 — decisão do desenvolvedor (opção a) sobre o critério 9 "ATTACH falha":
  testar que o ATTACH de ARQUIVO falha e que um ATTACH ':memory:' fica inerte (CREATE no
  anexado e tabelas TEMP falham; banco principal idêntico). O better-sqlite3 não permite
  bloquear o ATTACH ':memory:'; registrar em "Decisões".
- Para a Etapa 2: statement.readonly é true para ATTACH; o bloqueio tem que vir do parser
  (camada 3).
- Plano do 1.5 já combinado: A) check.ts + db:check; B) testes client/integrity;
  C) testes readonly/views; D) regra de lint para src/lib/agent; E) verificação e fechamento.
