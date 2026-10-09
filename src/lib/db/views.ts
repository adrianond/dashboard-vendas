// Camada de dados do LLM (PRD, seção 6.5; CLAUDE.md, seção 4). As views são criadas pela
// migration drizzle/0001_views.sql. Na Etapa 2, o validador de SQL usa ALLOWED_VIEWS como allowlist.

export const ALLOWED_VIEWS = [
  // Visões analíticas (primeira escolha do LLM)
  "vw_venda_detalhada",
  "vw_proposta_detalhada",
  "vw_desempenho_vendedor_mes",
  // Dimensões
  "vw_unidade",
  "vw_vendedor",
  "vw_cliente",
  "vw_produto",
  // Fatos
  "vw_proposta",
  "vw_venda",
  "vw_meta_vendedor",
] as const;

export type AllowedView = (typeof ALLOWED_VIEWS)[number];

// Toda coluna de tabela base que NÃO aparece com o mesmo nome em nenhuma view, com o motivo.
// Coluna nova numa tabela exige a decisão consciente: expor numa view ou listar aqui
// (o teste de completude, no passo 1.5, falha caso contrário).
export const EXCLUDED_COLUMNS: Record<string, string> = {
  "unidade.cnpj": "desnecessário para análise",
  "unidade.logradouro": "endereço: desnecessário para análise",
  "unidade.numero": "endereço: desnecessário para análise",
  "unidade.bairro": "endereço: desnecessário para análise",
  "unidade.cep": "endereço: desnecessário para análise",
  "unidade.telefone": "contato: desnecessário para análise",
  "unidade.email": "contato: desnecessário para análise",
  "vendedor.cpf": "dado pessoal",
  "vendedor.email": "dado pessoal",
  "vendedor.telefone": "dado pessoal",
  "cliente.nome": "dado pessoal de PF; exposto só como razao_social, quando PJ",
  "cliente.documento": "dado pessoal (CPF/CNPJ)",
  "cliente.email": "dado pessoal",
  "cliente.telefone": "dado pessoal",
  "cliente.data_nascimento": "dado pessoal; exposto só como faixa_etaria",
  "proposta.observacao": "texto livre: pode conter dados pessoais e é vetor de injeção de prompt",
  "venda.numero_nota_fiscal": "desnecessário para análise",
};
