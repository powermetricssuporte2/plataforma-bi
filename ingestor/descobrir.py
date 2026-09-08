"""Procura no Drive todas as pastas de exportacao do ERP visiveis a service account.

O indice local do Drive para Desktop nao serve para isso: pasta compartilhada
que o usuario nao sincronizou (fica so em "Compartilhados comigo") nao aparece
la, e foi assim que a exportacao da Imezza ficou de fora do mapeamento. Quem
enxerga tudo que foi compartilhado e a propria service account.

Roda como `python main.py --descobrir` e grava o resultado em _meta.pastas_erp,
para conferir o que existe no Drive contra o config/clientes.yaml.
"""

# Presenca destas tabelas identifica uma exportacao do ERP.
ASSINATURA = ["FCX_VENDA.csv", "EST_PRODUTO.csv", "GER_PESSOA.csv",
              "FAT_NOTA_FISCAL.csv", "GER_EMPRESA.csv"]
MINIMO = 3


def _paginar(svc, **kwargs):
    token = None
    while True:
        resp = svc.files().list(pageToken=token, pageSize=1000,
                                includeItemsFromAllDrives=True,
                                supportsAllDrives=True, **kwargs).execute()
        yield from resp.get("files", [])
        token = resp.get("nextPageToken")
        if not token:
            return


def _mapa_de_pastas(svc):
    return {f["id"]: {"nome": f.get("name", ""), "pais": f.get("parents", [])}
            for f in _paginar(
                svc,
                q="mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                fields="nextPageToken, files(id, name, parents)")}


def pastas_com_exportacao(svc):
    """Devolve uma linha por pasta que contem exportacao do ERP."""
    achados = {}
    for nome_tabela in ASSINATURA:
        for f in _paginar(
                svc,
                q=f"name = '{nome_tabela}' and trashed = false",
                fields="nextPageToken, files(id, name, parents, modifiedTime, size)"):
            for pai in f.get("parents", []):
                reg = achados.setdefault(pai, {"tabelas": set(), "modificado_em": ""})
                reg["tabelas"].add(nome_tabela)
                if (f.get("modifiedTime") or "") > reg["modificado_em"]:
                    reg["modificado_em"] = f.get("modifiedTime") or ""

    pastas = _mapa_de_pastas(svc)
    cache = {}

    def caminho(pid, prof=0):
        if not pid or prof > 15:
            return ""
        if pid in cache:
            return cache[pid]
        p = pastas.get(pid)
        if not p:
            return ""
        valor = (caminho(p["pais"][0], prof + 1) if p["pais"] else "") + "/" + p["nome"]
        cache[pid] = valor
        return valor

    saida = []
    for pid, reg in achados.items():
        if len(reg["tabelas"]) < MINIMO:
            continue
        p = pastas.get(pid, {})
        saida.append({
            "pasta_id": pid,
            "pasta": p.get("nome", ""),
            "caminho": caminho(pid),
            "tabelas_encontradas": len(reg["tabelas"]),
            "modificado_em": reg["modificado_em"] or None,
        })
    return sorted(saida, key=lambda x: x["modificado_em"] or "", reverse=True)
