import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from whitelist import should_ingest, table_from_filename


def test_whitelisted():
    assert should_ingest("FCX_VENDA.csv")
    assert should_ingest("fcx_venda.CSV")
    assert should_ingest("CAI_CONTA_PAGAR_EX.csv")


def test_blacklist():
    assert not should_ingest("FAT_NFCE_XML.csv")   # 333 MB de XML bruto
    assert not should_ingest("GER_TIPI.csv")
    assert not should_ingest("USR_PERMISSAO.csv")
    assert not should_ingest("GER_MODELO_EMAIL.csv")


def test_fora_da_whitelist_e_nao_csv():
    assert not should_ingest("VEI_PNEU_MODELO.csv")
    assert not should_ingest("EST_PRODUTO.xlsx")
    assert table_from_filename("nota.txt") is None
