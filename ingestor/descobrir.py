"""Mapeia o Drive por ID: quais empresas existem e qual pasta e a fonte de cada uma.

O indice local do Drive para Desktop nao serve para isso: pasta compartilhada
que o usuario nao sincronizou (fica so em "Compartilhados comigo") nao aparece
la, e foi assim que a exportacao da Imezza ficou de fora do mapeamento. Quem
enxerga tudo que foi compartilhado e a propria service account.

Duas saidas, as duas com o ID do Drive em cada linha, para conferir a origem do
dado sem depender de nome de pasta:

  _meta.pastas_erp      uma linha por pasta de exportacao encontrada, com a
                        empresa dona (o ID dela), o caminho e o id do cliente
                        configurado que aponta para aquela pasta.
  _meta.empresas_drive  uma linha por empresa vista no Drive, dizendo se tem
                        exportacao, se tem relatorio Power BI e se esta na
                        plataforma — e aqui que aparece a empresa que so tem BI
                        e nenhum CSV.

Roda como `python main.py --descobrir`.
"""

# Presenca destas tabelas identifica uma exportacao do ERP.
ASSINATURA = ["FCX_VENDA.csv", "EST_PRODUTO.csv", "GER_PESSOA.csv",
              "FAT_NOTA_FISCAL.csv", "GER_EMPRESA.csv"]
MINIMO = 3
# Nivel imediatamente abaixo desta pasta e a empresa.
RAIZ_EMPRESAS = "empresas"
EXT_RELATORIO = (".pbix", ".pbip", ".pbit")


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


def _cadeia(pastas, pid, limite=15):
    """Sobe do id ate a raiz visivel, devolvendo a lista de ids do pai para cima."""
    fora = []
    atual = pid
    while atual and len(fora) < limite:
        p = pastas.get(atual)
        if not p:
            break
        fora.append(atual)
        atual = p["pais"][0] if p["pais"] else None
    return fora


def _empresa_de(pastas, pid):
    """Empresa dona da pasta: o nivel logo abaixo de "Empresas".

    Sem esse ancestral visivel (pasta compartilhada direto, como a da Imezza),
    devolve o ancestral mais alto que a service account enxerga — que e, na
    pratica, o proprio recorte compartilhado.
    """
    cadeia = _cadeia(pastas, pid)
    for i, ident in enumerate(cadeia):
        pai = pastas.get(ident, {}).get("pais") or []
        if pai and pastas.get(pai[0], {}).get("nome", "").strip().lower() == RAIZ_EMPRESAS:
            return ident, pastas[ident]["nome"]
    topo = cadeia[-1] if cadeia else pid
    return topo, pastas.get(topo, {}).get("nome", "")


def pastas_com_exportacao(svc, pastas=None, configurados=None):
    """Uma linha por pasta que contem exportacao do ERP, com a empresa dona."""
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

    pastas = pastas if pastas is not None else _mapa_de_pastas(svc)
    configurados = configurados or {}
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
        empresa_id, empresa = _empresa_de(pastas, pid)
        saida.append({
            "pasta_id": pid,
            "pasta": p.get("nome", ""),
            "caminho": caminho(pid),
            "empresa": empresa,
            "empresa_id": empresa_id,
            "cliente_configurado": configurados.get(pid),
            "tabelas_encontradas": len(reg["tabelas"]),
            "modificado_em": reg["modificado_em"] or None,
        })
    return sorted(saida, key=lambda x: x["modificado_em"] or "", reverse=True)


def empresas_do_drive(svc, pastas=None, exportacoes=None, configurados=None):
    """Uma linha por empresa vista no Drive, com o que ela tem de fonte.

    Empresa aqui e a pasta logo abaixo de "Empresas", mais os recortes
    compartilhados direto que nao tem esse ancestral visivel. Sem isto nao da
    para dizer que a plataforma cobre a carteira inteira: so daria para listar
    o que ja esta configurado.
    """
    pastas = pastas if pastas is not None else _mapa_de_pastas(svc)
    configurados = configurados or {}
    exportacoes = exportacoes if exportacoes is not None else pastas_com_exportacao(
        svc, pastas, configurados)

    raizes = {i for i, p in pastas.items() if p["nome"].strip().lower() == RAIZ_EMPRESAS}
    empresas = {i: p["nome"] for i, p in pastas.items()
                if p["pais"] and p["pais"][0] in raizes}
    # Recorte compartilhado direto entra como empresa propria, senao a Imezza
    # da vida some deste mapa.
    for e in exportacoes:
        empresas.setdefault(e["empresa_id"], e["empresa"])

    por_empresa = {}
    for e in exportacoes:
        reg = por_empresa.setdefault(e["empresa_id"], {"pastas": 0, "mod": "", "cliente": None})
        reg["pastas"] += 1
        reg["mod"] = max(reg["mod"], e["modificado_em"] or "")
        reg["cliente"] = reg["cliente"] or e["cliente_configurado"]

    # Relatorios Power BI por empresa: e o que separa "empresa sem CSV nenhum"
    # de "empresa que so tem BI e por isso ainda depende do Power BI".
    relatorios = {}
    # Filtra pelo nome no proprio servidor: listar todos os arquivos visiveis
    # para depois peneirar em Python torna a varredura inviavel num Drive de
    # consultoria — sao centenas de milhares de arquivos.
    consulta = " or ".join(f"name contains '{e}'" for e in EXT_RELATORIO)
    for f in _paginar(svc,
                      q=(f"({consulta}) and trashed = false "
                         "and mimeType != 'application/vnd.google-apps.folder'"),
                      fields="nextPageToken, files(id, name, parents)"):
        if not f.get("name", "").lower().endswith(EXT_RELATORIO):
            continue
        for pai in f.get("parents", []):
            eid, _ = _empresa_de(pastas, pai)
            relatorios[eid] = relatorios.get(eid, 0) + 1

    saida = []
    for eid, nome in empresas.items():
        reg = por_empresa.get(eid, {})
        saida.append({
            "empresa_id": eid,
            "empresa": nome,
            "pastas_exportacao": reg.get("pastas", 0),
            "relatorios_bi": relatorios.get(eid, 0),
            "cliente_configurado": reg.get("cliente"),
            "modificado_em": reg.get("mod") or None,
        })
    return sorted(saida, key=lambda x: (x["pastas_exportacao"] > 0, x["modificado_em"] or ""),
                  reverse=True)
