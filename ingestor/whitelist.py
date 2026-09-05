"""Tabelas do dump SB Sistemas que entram no BigQuery."""

WHITELIST = {
    "CAI_BANCO", "CAI_PLANO_CONTA", "CAI_CENTRO_CUSTO",
    "CAI_CONTA_PAGAR_EX", "CAI_CONTA_RECEBER_BAIXA_PGTO", "CAI_MOVIMENTACAO",
    "FAT_NOTA_FISCAL", "FAT_DFE",
    "FCX_VENDA", "FCX_VENDA_PRODUTO",
    "EST_PRODUTO", "EST_ALMOXARIFADO_PRODUTO", "EST_GRUPO",
    "GER_PESSOA", "GER_EMPRESA",
    "ADM_META", "ADM_META_GLOBAL",
}

# Nunca ingerir, mesmo se alguém colocar na whitelist por engano.
BLACKLIST_PREFIXES = ("USR_", "GER_MODELO_")
BLACKLIST_EXACT = {"FAT_NFCE_XML", "GER_TIPI", "GER_GRID_VIEW", "GER_CONFIG_GRID"}


def table_from_filename(filename: str):
    """'FCX_VENDA.csv' -> 'FCX_VENDA'; retorna None se não for CSV."""
    if not filename.upper().endswith(".csv".upper()):
        return None
    return filename[:-4].upper()


def should_ingest(filename: str) -> bool:
    t = table_from_filename(filename)
    if t is None:
        return False
    if t in BLACKLIST_EXACT or t.startswith(BLACKLIST_PREFIXES):
        return False
    return t in WHITELIST
