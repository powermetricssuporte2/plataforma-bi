from relatorios import classificar, empresa_do_caminho


def test_nome_da_empresa_vem_padronizado_em_caixa_alta():
    # No Drive convivem "ULTRASAT", "Vagalume" e "ami"; a lista precisa
    # apresentar um estilo so.
    assert empresa_do_caminho("/Empresas/ami/x.pbix") == "AMI"
    assert empresa_do_caminho("/Empresas/Vagalume/x.pbix") == "VAGALUME"


def test_empresa_e_o_nivel_abaixo_de_empresas():
    assert empresa_do_caminho("/Empresas/Adriane Modas/POWER BI/x.pbix") == "ADRIANE MODAS"
    assert empresa_do_caminho("/Empresas/Delta/POWERBI_DELTA1.pbix") == "DELTA"


def test_pasta_de_projeto_nao_vira_nome_do_cliente():
    # "BI RODEIO" e "Gestao de velocidade" sao pastas internas do cliente.
    assert empresa_do_caminho(
        "/Empresas/Frigurifico Rodeio/BI RODEIO/tela.pbix") == "FRIGURIFICO RODEIO"
    assert empresa_do_caminho(
        "/Empresas/ULTRASAT/FUGA/Gestao de velocidade/v1.pbix") == "ULTRASAT"


def test_cliente_inativo_esta_um_nivel_mais_fundo():
    caminho = "/Empresas/01 - INATIVAS/Hidrolux/Power Bi/h.pbix"
    assert empresa_do_caminho(caminho) == "HIDROLUX"
    assert classificar(caminho) == "inativo"


def test_material_interno_nao_conta_como_cliente():
    caminho = "/Empresas/01 - PowerMetrics/Templates PowerBi/base.pbix"
    assert classificar(caminho) == "interno"


def test_relatorio_de_cliente_ativo():
    assert classificar("/Empresas/UNILAR/Power Bi/UNILAR CSV.pbix") == "cliente"


def test_caminho_fora_de_empresas_nao_quebra():
    assert empresa_do_caminho("/Meu Drive/solto.pbix") == "MEU DRIVE"
    assert empresa_do_caminho("/x.pbix") == "(SEM PASTA)"


from relatorios import apenas_mais_recentes, chave_do_relatorio


def test_copias_caem_na_mesma_chave():
    base = chave_do_relatorio("POWERBI_DELTA1.pbix")
    assert chave_do_relatorio("POWERBI_DELTA1 - Copia.pbix") == base
    assert chave_do_relatorio("POWERBI_DELTA1 - Copia (2).pbix") == base
    assert chave_do_relatorio("POWERBI_DELTA1 - Cópia.pbix") == base


def test_copia_de_copia_tambem_agrupa():
    base = chave_do_relatorio("Luz da Lua PowerBi.pbix")
    assert chave_do_relatorio("Luz da Lua PowerBi - Copia - Copia.pbix") == base


def test_backup_com_data_agrupa_com_o_original():
    assert chave_do_relatorio("CARBOMARAU_backup_20260414.pbix") == chave_do_relatorio("CARBOMARAU.pbix")


def test_extensoes_diferentes_do_mesmo_relatorio_agrupam():
    assert chave_do_relatorio("Angab.pbip") == chave_do_relatorio("Angab.pbix")


def test_mantem_apenas_a_versao_mais_recente():
    itens = [
        {"empresa": "Delta", "nome": "X.pbix", "modificado_em": "2026-09-04T10:00:00Z"},
        {"empresa": "Delta", "nome": "X - Copia.pbix", "modificado_em": "2026-09-04T12:00:00Z"},
        {"empresa": "Delta", "nome": "X - Copia (2).pbix", "modificado_em": "2026-01-01T00:00:00Z"},
    ]
    r = apenas_mais_recentes(itens)
    assert len(r) == 1
    assert r[0]["modificado_em"] == "2026-09-04T12:00:00Z"


def test_empresas_diferentes_nao_se_misturam():
    itens = [
        {"empresa": "Delta", "nome": "Vendas.pbix", "modificado_em": "2026-09-01T00:00:00Z"},
        {"empresa": "Angab", "nome": "Vendas.pbix", "modificado_em": "2026-09-02T00:00:00Z"},
    ]
    assert len(apenas_mais_recentes(itens)) == 2
