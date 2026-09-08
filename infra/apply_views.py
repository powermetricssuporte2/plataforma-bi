"""Descobre colunas reais via INFORMATION_SCHEMA e aplica as views por cliente.

O dump SB varia pouco entre clientes, mas nomes de colunas podem diferir.
Estratégia: para cada placeholder __COL_*__, procurar a 1ª coluna da tabela cujo
nome bate com uma lista de candidatos (ordem = preferência). Se nenhuma existir,
pular a view e registrar em DECISOES.md.
"""
import os, re, sys
from google.cloud import bigquery
import yaml

PROJECT = os.environ.get("GCP_PROJECT_ID") or os.environ.get("GOOGLE_CLOUD_PROJECT")
HERE = os.path.dirname(__file__)
VIEWS = os.path.join(HERE, "..", "sql", "views")
CFG = os.path.join(HERE, "..", "config", "clientes.yaml")

CANDIDATOS = {
    # placeholder: (tabela, [colunas candidatas em ordem de preferência])
    "vw_faturamento_mensal": {
        "__COL_NF_DATA__":   ("FAT_NOTA_FISCAL", ["NFL_DATA_EMISSAO", "NF_DATA_EMISSAO", "NOF_DATA_EMISSAO", "DATA_EMISSAO"]),
        "__COL_NF_VALOR__":  ("FAT_NOTA_FISCAL", ["NFL_VALOR_TOTAL", "NF_VALOR_TOTAL", "NOF_VALOR_TOTAL", "VALOR_TOTAL"]),
        "__COL_PDV_DATA__":  ("FCX_VENDA", ["VEN_DATA_INC", "VDA_DATA", "VEN_DATA", "DATA"]),
        "__COL_PDV_VALOR__": ("FCX_VENDA", ["VEN_VALOR_TOTAL", "VDA_VALOR_TOTAL", "VDA_VALOR", "VALOR_TOTAL"]),
    },
    "vw_vendas_pdv": {
        "__COL_DATA__":  ("FCX_VENDA", ["VEN_DATA_INC", "VDA_DATA", "VEN_DATA", "DATA"]),
        "__COL_VALOR__": ("FCX_VENDA", ["VEN_VALOR_TOTAL", "VDA_VALOR_TOTAL", "VDA_VALOR", "VALOR_TOTAL"]),
    },
    "vw_top_produtos": {
        "__COL_PROD_ID__":  ("FCX_VENDA_PRODUTO", ["PRO_CODIGO", "VDP_PRO_CODIGO", "VDP_PRODUTO"]),
        "__COL_VP_VALOR__": ("FCX_VENDA_PRODUTO", ["VEP_VALOR_TOTAL", "VDP_VALOR_TOTAL", "VALOR_TOTAL"]),
        "__COL_VP_QTD__":   ("FCX_VENDA_PRODUTO", ["VEP_QUANTIDADE", "VDP_QUANTIDADE", "QUANTIDADE"]),
        "__COL_PROD_PK__":  ("EST_PRODUTO", ["PRO_CODIGO", "PRO_ID"]),
        "__COL_PROD_NOME__":("EST_PRODUTO", ["PRO_NOME", "PRO_DESCRICAO", "PRO_DESC"]),
    },
    "vw_contas_pagar": {
        # este ERP não guarda vencimento em CAI_CONTA_PAGAR_EX; usa emissão como aproximação
        "__COL_VENC__":  ("CAI_CONTA_PAGAR_EX", ["CPG_DATA_VENCIMENTO", "CPG_VENCIMENTO", "DATA_VENCIMENTO", "CNP_DATA_EMISSAO"]),
        "__COL_VALOR__": ("CAI_CONTA_PAGAR_EX", ["CPG_VALOR", "CNP_VALOR", "VALOR"]),
    },
    "vw_contas_receber": {
        "__COL_DATA__":  ("CAI_CONTA_RECEBER_BAIXA_PGTO", ["CRB_DATA_PAGAMENTO", "CRB_DATA", "DATA_PAGAMENTO", "DATA"]),
        "__COL_VALOR__": ("CAI_CONTA_RECEBER_BAIXA_PGTO", ["CRB_VALOR_PAGO", "CRB_VALOR", "VALOR_PAGO"]),
    },
    "vw_estoque_posicao": {
        "__COL_PROD_ID__":  ("EST_ALMOXARIFADO_PRODUTO", ["ALP_PRO_CODIGO", "PRO_CODIGO"]),
        "__COL_SALDO__":    ("EST_ALMOXARIFADO_PRODUTO", ["ALP_SALDO", "ALP_QUANTIDADE", "SALDO", "ALP_EST_ATUAL"]),
        "__COL_PROD_PK__":  ("EST_PRODUTO", ["PRO_CODIGO", "PRO_ID"]),
        "__COL_PROD_GRUPO__":("EST_PRODUTO", ["PRO_GRU_CODIGO", "GRU_CODIGO", "PRO_GRUPO"]),
        "__COL_GRUPO_PK__": ("EST_GRUPO", ["GRU_CODIGO", "GRU_ID"]),
        "__COL_GRUPO_NOME__":("EST_GRUPO", ["GRU_NOME", "GRU_DESCRICAO"]),
    },
}
# Placeholder ausente aqui nao mata a view: vira NULL, o ramo correspondente
# fica sem linhas e a view cai na outra fonte. Serve para o cliente que so tem
# nota fiscal ou so tem caixa.
OPCIONAIS = {"__COL_PDV_DATA__", "__COL_PDV_VALOR__", "__COL_NF_DATA__", "__COL_NF_VALOR__"}

ORDEM = ["_helpers", "vw_faturamento_mensal", "vw_vendas_pdv", "vw_top_produtos",
         "vw_contas_pagar", "vw_contas_receber", "vw_estoque_posicao", "vw_resumo_home"]


def colunas(bq, dataset, tabela):
    q = f"""SELECT column_name FROM `{PROJECT}.{dataset}.INFORMATION_SCHEMA.COLUMNS`
            WHERE table_name = '{tabela}'"""
    try:
        return {r.column_name.upper() for r in bq.query(q).result()}
    except Exception:
        return set()


# Colunas de evento que nunca representam o fato medido: pegar
# VEN_DATA_CANCEL como "data da venda" faz o painel mostrar so o que foi
# cancelado, que foi exatamente o que aconteceu antes desta lista existir.
SUFIXOS_PROIBIDOS = ("CANCEL", "CANCELAMENTO", "EXC", "EXCLUSAO", "ESTORNO",
                     "DELET", "REEMISSAO", "ALTERACAO", "UPD")


def descartar(coluna):
    return any(p in coluna for p in SUFIXOS_PROIBIDOS)


def escolher(cols_reais, candidatas):
    for c in candidatas:
        if c.upper() in cols_reais:
            return c
    # Fallback: coluna real que contenha o "miolo" da candidata (DATA, VALOR...),
    # ignorando colunas de cancelamento/exclusao. A ordem alfabetica sozinha
    # escolhia CANCEL antes de INC.
    for c in candidatas:
        chave = re.sub(r"^[A-Z]+_", "", c)
        aptas = [r for r in sorted(cols_reais) if chave in r and not descartar(r)]
        if aptas:
            return aptas[0]
    return None


def main():
    bq = bigquery.Client(project=PROJECT)
    clientes = [c for c in yaml.safe_load(open(CFG))["clientes"] if c.get("ativo")]
    decisoes = []
    for cli in clientes:
        ds = cli["id"]
        for nome in ORDEM:
            sql = open(os.path.join(VIEWS, f"{nome}.sql")).read().replace("__DATASET__", f"{PROJECT}.{ds}")
            ok = True
            for ph, (tab, cands) in CANDIDATOS.get(nome, {}).items():
                cols = colunas(bq, ds, tab)
                col = escolher(cols, cands) if cols else None
                if not col and ph in OPCIONAIS:
                    decisoes.append(f"[{ds}] {nome}: sem {ph} em {tab} — ramo desligado")
                    col = "CAST(NULL AS STRING)"
                if not col:
                    decisoes.append(f"[{ds}] {nome}: sem coluna para {ph} em {tab} — view pulada")
                    ok = False
                    break
                sql = sql.replace(ph, col)
            if not ok:
                continue
            try:
                bq.query(sql).result()
                print(f"[{ds}] {nome}: OK")
            except Exception as e:
                decisoes.append(f"[{ds}] {nome}: erro ao criar — {e}")
                print(f"[{ds}] {nome}: ERRO {e}", file=sys.stderr)
    if decisoes:
        with open(os.path.join(HERE, "..", "DECISOES.md"), "a") as f:
            f.write("\n".join(decisoes) + "\n")
        print("\nPendências registradas em DECISOES.md")


if __name__ == "__main__":
    main()
