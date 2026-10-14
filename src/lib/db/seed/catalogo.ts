import type { produto } from "../schema";

// Catálogo fixo (sem aleatoriedade): versões reais do mercado brasileiro com preços aproximados
// de 2025. preco_tabela é o preço ATUAL (fim do período); o ajuste para a época de cada proposta
// é aplicado em proposta.valor_tabela, no passo 1.4.

export type TipoVeiculo = "LEVE" | "MOTO" | "PESADO";
export type Categoria =
  | "HATCH" | "SEDAN" | "SUV" | "PICAPE" | "UTILITARIO"
  | "STREET" | "TRAIL" | "SCOOTER" | "ESPORTIVA" | "CUSTOM"
  | "CAMINHAO" | "ONIBUS";
export type Combustivel = "FLEX" | "GASOLINA" | "DIESEL" | "HIBRIDO" | "ELETRICO";

export type ItemCatalogo = {
  marca: string;
  modelo: string;
  versao: string;
  tipo_veiculo: TipoVeiculo;
  categoria: Categoria;
  combustivel: Combustivel;
  preco_tabela: number;
  ativo: 0 | 1;
};

export const ANO_MODELO = 2025;

const leve = (
  marca: string, modelo: string, versao: string, categoria: Categoria, combustivel: Combustivel,
  preco_tabela: number, ativo: 0 | 1 = 1,
): ItemCatalogo => ({ marca, modelo, versao, tipo_veiculo: "LEVE", categoria, combustivel, preco_tabela, ativo });

const moto = (
  marca: string, modelo: string, versao: string, categoria: Categoria, combustivel: Combustivel,
  preco_tabela: number, ativo: 0 | 1 = 1,
): ItemCatalogo => ({ marca, modelo, versao, tipo_veiculo: "MOTO", categoria, combustivel, preco_tabela, ativo });

const pesado = (
  marca: string, modelo: string, versao: string, categoria: Categoria, combustivel: Combustivel,
  preco_tabela: number,
): ItemCatalogo => ({ marca, modelo, versao, tipo_veiculo: "PESADO", categoria, combustivel, preco_tabela, ativo: 1 });

export const CATALOGO: ItemCatalogo[] = [
  // ===== LEVE (37) =====
  leve("Fiat", "Mobi", "Like 1.0", "HATCH", "FLEX", 76990),
  leve("Fiat", "Argo", "Drive 1.3", "HATCH", "FLEX", 94990),
  leve("Fiat", "Cronos", "Drive 1.3", "SEDAN", "FLEX", 104990),
  leve("Fiat", "Pulse", "Audace 1.0 Turbo", "SUV", "FLEX", 129990),
  leve("Fiat", "Fastback", "Impetus 1.0 Turbo", "SUV", "FLEX", 154990),
  leve("Fiat", "Strada", "Volcano 1.3 CD", "PICAPE", "FLEX", 124990),
  leve("Fiat", "Toro", "Volcano 2.2 Turbodiesel", "PICAPE", "DIESEL", 209990),
  leve("Fiat", "Fiorino", "Endurance 1.4", "UTILITARIO", "FLEX", 104990),
  leve("Volkswagen", "Polo", "Highline 1.0 TSI", "HATCH", "FLEX", 117990),
  leve("Volkswagen", "Virtus", "Highline 1.0 TSI", "SEDAN", "FLEX", 139990),
  leve("Volkswagen", "Nivus", "Highline 1.0 TSI", "SUV", "FLEX", 149990),
  leve("Volkswagen", "T-Cross", "Highline 1.4 TSI", "SUV", "FLEX", 169990),
  leve("Volkswagen", "Taos", "Highline 1.4 TSI", "SUV", "FLEX", 219990),
  leve("Volkswagen", "Saveiro", "Extreme 1.6 CD", "PICAPE", "FLEX", 119990),
  leve("Volkswagen", "Amarok", "Extreme V6", "PICAPE", "DIESEL", 349990),
  leve("Chevrolet", "Onix", "LT 1.0", "HATCH", "FLEX", 97990),
  leve("Chevrolet", "Onix Plus", "Premier 1.0 Turbo", "SEDAN", "FLEX", 124990),
  leve("Chevrolet", "Tracker", "Premier 1.2 Turbo", "SUV", "FLEX", 169990),
  leve("Chevrolet", "Montana", "Premier 1.2 Turbo", "PICAPE", "FLEX", 154990),
  leve("Chevrolet", "S10", "High Country 2.8", "PICAPE", "DIESEL", 299990),
  leve("Toyota", "Yaris", "XLS 1.5", "HATCH", "FLEX", 114990),
  leve("Toyota", "Corolla", "XEi 2.0", "SEDAN", "FLEX", 169990),
  leve("Toyota", "Corolla", "Altis Premium Hybrid", "SEDAN", "HIBRIDO", 199990),
  leve("Toyota", "Corolla Cross", "XRE 2.0", "SUV", "FLEX", 179990),
  leve("Toyota", "Hilux", "SRX Plus 2.8", "PICAPE", "DIESEL", 339990),
  leve("Toyota", "SW4", "Diamond 2.8", "SUV", "DIESEL", 429990),
  leve("Hyundai", "HB20", "Comfort 1.0", "HATCH", "FLEX", 92990),
  leve("Hyundai", "HB20S", "Platinum 1.0 Turbo", "SEDAN", "FLEX", 122990),
  leve("Hyundai", "Creta", "Ultimate 2.0", "SUV", "FLEX", 184990),
  leve("Jeep", "Renegade", "Longitude 1.3 Turbo", "SUV", "FLEX", 154990),
  leve("Jeep", "Compass", "Limited 1.3 Turbo", "SUV", "FLEX", 209990),
  leve("Jeep", "Commander", "Overland 2.2", "SUV", "DIESEL", 289990),
  leve("BYD", "Dolphin", "EV", "HATCH", "ELETRICO", 149990),
  leve("BYD", "Seal", "AWD", "SEDAN", "ELETRICO", 299990),
  leve("BYD", "Song Plus", "DM-i", "SUV", "HIBRIDO", 239990),
  leve("Renault", "Kwid", "Zen 1.0", "HATCH", "FLEX", 72990, 0), // fora de linha
  leve("Renault", "Master", "Furgão L3H2 2.3", "UTILITARIO", "DIESEL", 259990),

  // ===== MOTO (15) =====
  moto("Honda", "Pop", "110i ES", "STREET", "GASOLINA", 12990),
  moto("Honda", "CG 160", "Titan", "STREET", "FLEX", 17490),
  moto("Honda", "Biz", "125 EX", "SCOOTER", "FLEX", 15990),
  moto("Honda", "NXR 160", "Bros ESDD", "TRAIL", "FLEX", 21490),
  moto("Honda", "XRE 300", "Sahara Adventure", "TRAIL", "FLEX", 34990),
  moto("Honda", "CBR 650R", "Standard", "ESPORTIVA", "GASOLINA", 57990),
  moto("Honda", "Rebel", "500", "CUSTOM", "GASOLINA", 37990),
  moto("Yamaha", "Factor 150", "UBS", "STREET", "FLEX", 16490, 0), // fora de linha
  moto("Yamaha", "Fazer FZ25", "ABS", "STREET", "FLEX", 23490),
  moto("Yamaha", "Lander 250", "ABS", "TRAIL", "FLEX", 26990),
  moto("Yamaha", "NMax 160", "Connected", "SCOOTER", "GASOLINA", 21990),
  moto("Yamaha", "R3", "ABS", "ESPORTIVA", "GASOLINA", 34990),
  moto("Kawasaki", "Ninja 400", "Standard", "ESPORTIVA", "GASOLINA", 38990),
  moto("Kawasaki", "Vulcan S", "Standard", "CUSTOM", "GASOLINA", 49990),
  moto("BMW Motorrad", "R 1300 GS", "Standard", "TRAIL", "GASOLINA", 114990),

  // ===== PESADO (10) =====
  pesado("Mercedes-Benz", "Accelo", "1017", "CAMINHAO", "DIESEL", 389990),
  pesado("Mercedes-Benz", "Atego", "2430", "CAMINHAO", "DIESEL", 629990),
  pesado("Mercedes-Benz", "Actros", "2653", "CAMINHAO", "DIESEL", 1149990),
  pesado("Mercedes-Benz", "O 500", "RSD", "ONIBUS", "DIESEL", 1190000),
  pesado("Volvo", "VM", "270", "CAMINHAO", "DIESEL", 749990),
  pesado("Volvo", "FH", "540 6x4", "CAMINHAO", "DIESEL", 1349990),
  pesado("Volvo", "B270F", "Urbano", "ONIBUS", "DIESEL", 899990),
  pesado("Scania", "R 450", "6x2", "CAMINHAO", "DIESEL", 1089990),
  pesado("Scania", "K 360", "Rodoviário", "ONIBUS", "DIESEL", 989990),
  pesado("BYD", "D9W", "Elétrico", "ONIBUS", "ELETRICO", 1490000),
];

export function gerarProdutos(): (typeof produto.$inferInsert)[] {
  return CATALOGO.map((item) => ({
    ...item,
    descricao: `${item.marca} ${item.modelo} ${item.versao}`,
    ano_modelo: ANO_MODELO,
  }));
}
