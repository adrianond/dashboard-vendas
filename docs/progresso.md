# Progresso

## Etapa 1 — Fundação e dados (PRD-etapa-01-fundacao-e-dados.md)

| Passo | Status | Commit |
|---|---|---|
| 1.0 Regras de trabalho do Claude Code | ✅ concluído | 99cd22e |
| 1.1 Setup do projeto | ✅ concluído | 99cd22e |
| 1.2 Schema e migrations | ✅ concluído | bef0c74 |
| 1.3 Seed das entidades de cadastro | ✅ concluído | 3a8843b |
| 1.4 Seed de propostas, vendas e metas | ✅ concluído | af9e3a5 |
| 1.5 Verificação de integridade e testes | ✅ concluído | |
| 1.6 Documentação do schema e fechamento | ⏳ próximo | |

## Pendências
- Preencher o hash do commit do passo 1.5 na tabela acima (junto com o commit do passo 1.6).
- Para a Etapa 2: statement.readonly é true para ATTACH e PRAGMA query_only = OFF é aceito
  por SQL; o validador (parser, camada 3) precisa recusar ATTACH e PRAGMA.
