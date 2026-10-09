CREATE TABLE `cliente` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tipo_pessoa` text NOT NULL,
	`nome` text NOT NULL,
	`documento` text NOT NULL,
	`email` text,
	`telefone` text NOT NULL,
	`cidade` text NOT NULL,
	`uf` text NOT NULL,
	`data_nascimento` text,
	`data_cadastro` text NOT NULL,
	CONSTRAINT "cliente_tipo_pessoa_ck" CHECK(tipo_pessoa IN ('PF','PJ')),
	CONSTRAINT "cliente_data_nascimento_ck" CHECK(tipo_pessoa = 'PF' OR data_nascimento IS NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cliente_documento_unique` ON `cliente` (`documento`);--> statement-breakpoint
CREATE TABLE `meta_vendedor` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vendedor_id` integer NOT NULL,
	`ano` integer NOT NULL,
	`mes` integer NOT NULL,
	`meta_quantidade` integer NOT NULL,
	`meta_valor` real NOT NULL,
	FOREIGN KEY (`vendedor_id`) REFERENCES `vendedor`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "meta_vendedor_mes_ck" CHECK(mes BETWEEN 1 AND 12),
	CONSTRAINT "meta_vendedor_meta_quantidade_ck" CHECK(meta_quantidade > 0),
	CONSTRAINT "meta_vendedor_meta_valor_ck" CHECK(meta_valor > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meta_vendedor_vendedor_ano_mes_uq` ON `meta_vendedor` (`vendedor_id`,`ano`,`mes`);--> statement-breakpoint
CREATE TABLE `produto` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`marca` text NOT NULL,
	`modelo` text NOT NULL,
	`versao` text NOT NULL,
	`descricao` text NOT NULL,
	`tipo_veiculo` text NOT NULL,
	`categoria` text NOT NULL,
	`combustivel` text NOT NULL,
	`ano_modelo` integer NOT NULL,
	`preco_tabela` real NOT NULL,
	`ativo` integer NOT NULL,
	CONSTRAINT "produto_tipo_veiculo_ck" CHECK(tipo_veiculo IN ('LEVE','MOTO','PESADO')),
	CONSTRAINT "produto_categoria_ck" CHECK((tipo_veiculo = 'LEVE' AND categoria IN ('HATCH','SEDAN','SUV','PICAPE','UTILITARIO'))
       OR (tipo_veiculo = 'MOTO' AND categoria IN ('STREET','TRAIL','SCOOTER','ESPORTIVA','CUSTOM'))
       OR (tipo_veiculo = 'PESADO' AND categoria IN ('CAMINHAO','ONIBUS'))),
	CONSTRAINT "produto_combustivel_ck" CHECK(combustivel IN ('FLEX','GASOLINA','DIESEL','HIBRIDO','ELETRICO')),
	CONSTRAINT "produto_preco_tabela_ck" CHECK(preco_tabela > 0),
	CONSTRAINT "produto_ativo_ck" CHECK(ativo IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `produto_marca_modelo_versao_ano_uq` ON `produto` (`marca`,`modelo`,`versao`,`ano_modelo`);--> statement-breakpoint
CREATE TABLE `proposta` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`unidade_id` integer NOT NULL,
	`vendedor_id` integer NOT NULL,
	`cliente_id` integer NOT NULL,
	`produto_id` integer NOT NULL,
	`data_proposta` text NOT NULL,
	`valor_tabela` real NOT NULL,
	`valor_proposta` real NOT NULL,
	`forma_pagamento` text NOT NULL,
	`valor_entrada` real,
	`qtd_parcelas` integer,
	`status` text NOT NULL,
	`data_fechamento` text,
	`motivo_perda` text,
	`observacao` text,
	FOREIGN KEY (`unidade_id`) REFERENCES `unidade`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vendedor_id`) REFERENCES `vendedor`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cliente_id`) REFERENCES `cliente`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`produto_id`) REFERENCES `produto`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "proposta_valor_proposta_ck" CHECK(valor_proposta > 0),
	CONSTRAINT "proposta_forma_pagamento_ck" CHECK(forma_pagamento IN ('A_VISTA','FINANCIAMENTO','CONSORCIO','LEASING')),
	CONSTRAINT "proposta_valor_entrada_ck" CHECK(forma_pagamento <> 'FINANCIAMENTO' OR valor_entrada IS NOT NULL),
	CONSTRAINT "proposta_qtd_parcelas_ck" CHECK(forma_pagamento = 'A_VISTA' OR qtd_parcelas IS NOT NULL),
	CONSTRAINT "proposta_status_ck" CHECK(status IN ('EM_NEGOCIACAO','GANHA','PERDIDA','CANCELADA')),
	CONSTRAINT "proposta_data_fechamento_ck" CHECK(status = 'EM_NEGOCIACAO' OR data_fechamento IS NOT NULL),
	CONSTRAINT "proposta_motivo_perda_ck" CHECK(motivo_perda IS NULL OR motivo_perda IN ('PRECO','CREDITO_NEGADO','DESISTENCIA','CONCORRENCIA','PRAZO_ENTREGA')),
	CONSTRAINT "proposta_motivo_perda_obrigatorio_ck" CHECK(status <> 'PERDIDA' OR motivo_perda IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `proposta_data_proposta_idx` ON `proposta` (`data_proposta`);--> statement-breakpoint
CREATE INDEX `proposta_status_idx` ON `proposta` (`status`);--> statement-breakpoint
CREATE INDEX `proposta_unidade_id_idx` ON `proposta` (`unidade_id`);--> statement-breakpoint
CREATE INDEX `proposta_vendedor_id_idx` ON `proposta` (`vendedor_id`);--> statement-breakpoint
CREATE INDEX `proposta_produto_id_idx` ON `proposta` (`produto_id`);--> statement-breakpoint
CREATE INDEX `proposta_cliente_id_idx` ON `proposta` (`cliente_id`);--> statement-breakpoint
CREATE TABLE `unidade` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`cnpj` text NOT NULL,
	`logradouro` text NOT NULL,
	`numero` text NOT NULL,
	`bairro` text NOT NULL,
	`cidade` text NOT NULL,
	`uf` text NOT NULL,
	`regiao` text NOT NULL,
	`cep` text NOT NULL,
	`telefone` text NOT NULL,
	`email` text NOT NULL,
	`data_inauguracao` text NOT NULL,
	`ativo` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "unidade_uf_ck" CHECK(length(uf) = 2),
	CONSTRAINT "unidade_regiao_ck" CHECK(regiao IN ('NORTE','NORDESTE','CENTRO_OESTE','SUDESTE','SUL')),
	CONSTRAINT "unidade_ativo_ck" CHECK(ativo IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unidade_nome_unique` ON `unidade` (`nome`);--> statement-breakpoint
CREATE UNIQUE INDEX `unidade_cnpj_unique` ON `unidade` (`cnpj`);--> statement-breakpoint
CREATE TABLE `venda` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proposta_id` integer NOT NULL,
	`data_venda` text NOT NULL,
	`valor_final` real NOT NULL,
	`numero_nota_fiscal` text NOT NULL,
	`data_entrega` text,
	FOREIGN KEY (`proposta_id`) REFERENCES `proposta`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "venda_valor_final_ck" CHECK(valor_final > 0),
	CONSTRAINT "venda_data_entrega_ck" CHECK(data_entrega IS NULL OR data_entrega >= data_venda)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `venda_proposta_id_unique` ON `venda` (`proposta_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `venda_numero_nota_fiscal_unique` ON `venda` (`numero_nota_fiscal`);--> statement-breakpoint
CREATE INDEX `venda_data_venda_idx` ON `venda` (`data_venda`);--> statement-breakpoint
CREATE TABLE `vendedor` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`unidade_id` integer NOT NULL,
	`nome` text NOT NULL,
	`cpf` text NOT NULL,
	`email` text NOT NULL,
	`telefone` text NOT NULL,
	`data_admissao` text NOT NULL,
	`data_desligamento` text,
	`ativo` integer NOT NULL,
	FOREIGN KEY (`unidade_id`) REFERENCES `unidade`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "vendedor_ativo_ck" CHECK(ativo IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vendedor_cpf_unique` ON `vendedor` (`cpf`);--> statement-breakpoint
CREATE UNIQUE INDEX `vendedor_email_unique` ON `vendedor` (`email`);--> statement-breakpoint
CREATE INDEX `vendedor_unidade_id_idx` ON `vendedor` (`unidade_id`);