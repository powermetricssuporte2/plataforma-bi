"""Inventario dos relatorios Power BI guardados no Drive.

Cobre .pbix (relatorio), .pbip (projeto) e .pbit (modelo).

Serve para acompanhar a carteira de relatorios: quais existem, de qual cliente,
quando foram alterados pela ultima vez e quais estao parados ha tempo demais.
E independente da ingestao de CSV — um cliente pode ter relatorio sem exportar
dados e vice-versa.
"""
import re
import unicodedata

# Pastas que organizam o Drive, mas nao identificam o cliente.
INTERMEDIARIAS = {
    "power bi", "power_bi", "powerbi", "bi", "empresas", "meu drive",
    "relatorios", "relatorio", "arquivos", "documentos", "backup", "backups",
}
# Onde o arquivo nao representa um relatorio em uso de um cliente.
PASTA_INATIVA = "01 - inativas"
PASTA_INTERNA = "01 - powermetrics"


EXTENSOES = (".pbix", ".pbip", ".pbit")

# Sufixos que o Windows e o proprio usuario acrescentam ao duplicar um arquivo.
# Sem remove-los, "Delta", "Delta - Copia" e "Delta - Copia (2)" contariam como
# tres relatorios diferentes.
PADROES_COPIA = [
    r"\s*-\s*c[oó]pia(\s*\(\d+\))?",
    r"\s*-\s*copy(\s*\(\d+\))?",
    r"\s*\(\d+\)",
    r"\s*-?\s*backup[_\- ]?\d*",
    r"\s*-?\s*(antigo|antiga|old|bkp)",
    r"[_\- ]?\d{8}",           # CARBOMARAU_backup_20260414
]


def chave_do_relatorio(nome):
    """Nome sem extensao nem marca de copia, para agrupar as versoes do mesmo arquivo."""
    base = re.sub(r"\.(pbix|pbip|pbit)$", "", nome, flags=re.I)
    anterior = None
    while anterior != base:            # "- Copia - Copia" precisa de mais de uma passada
        anterior = base
        for padrao in PADROES_COPIA:
            base = re.sub(padrao, "", base, flags=re.I)
    return _sem_acento(base).strip(" -_") or _sem_acento(nome)


def apenas_mais_recentes(itens):
    """De cada grupo empresa+relatorio, mantem so a versao alterada por ultimo."""
    melhor = {}
    for i in itens:
        chave = (_sem_acento(i["empresa"]), chave_do_relatorio(i["nome"]))
        atual = melhor.get(chave)
        if atual is None or (i.get("modificado_em") or "") > (atual.get("modificado_em") or ""):
            melhor[chave] = i
    return sorted(melhor.values(), key=lambda i: i.get("modificado_em") or "", reverse=True)


def _sem_acento(txt):
    txt = unicodedata.normalize("NFKD", txt or "")
    return "".join(c for c in txt if not unicodedata.combining(c)).lower().strip()


def classificar(caminho):
    """Diz se o relatorio e de cliente ativo, de cliente inativo ou interno."""
    partes = [_sem_acento(p) for p in caminho.split("/") if p]
    if PASTA_INATIVA in partes:
        return "inativo"
    if PASTA_INTERNA in partes:
        return "interno"
    return "cliente"


def empresa_do_caminho(caminho):
    """'/Empresas/R1 Fashion/POWER BI/x.pbix' -> 'R1 Fashion'.

    No Drive a empresa e sempre o nivel logo abaixo de "Empresas". Subir a
    partir do arquivo procurando um nome "nao generico" nao funciona: pastas de
    projeto como "BI RODEIO" ou "Gestao de velocidade" seriam confundidas com o
    nome do cliente.
    """
    partes = [p for p in caminho.split("/") if p][:-1]  # tira o arquivo
    limpos = [_sem_acento(p) for p in partes]
    if "empresas" in limpos:
        i = limpos.index("empresas") + 1
        # "01 - INATIVAS" agrupa clientes antigos; o nome esta um nivel abaixo.
        if i < len(partes) and limpos[i] in (PASTA_INATIVA, PASTA_INTERNA):
            i += 1
        if i < len(partes):
            return partes[i]
    for nome in partes:
        if _sem_acento(nome) not in INTERMEDIARIAS:
            return nome
    return partes[0] if partes else "(sem pasta)"


def _paginar(svc, **kwargs):
    """Percorre todas as paginas de files().list()."""
    token = None
    while True:
        resp = svc.files().list(pageToken=token, pageSize=1000,
                                includeItemsFromAllDrives=True,
                                supportsAllDrives=True, **kwargs).execute()
        yield from resp.get("files", [])
        token = resp.get("nextPageToken")
        if not token:
            return


def listar_pbix(svc):
    """Devolve os relatorios visiveis para a service account, ja deduplicados."""
    arquivos = list(_paginar(
        svc,
        q=("(name contains '.pbix' or name contains '.pbip' or name contains '.pbit') "
           "and trashed = false and mimeType != 'application/vnd.google-apps.folder'"),
        fields="nextPageToken, files(id, name, modifiedTime, size, parents)"))

    # Todas as pastas de uma vez: resolver o caminho consultando pasta a pasta
    # levava centenas de chamadas e o job estourava o tempo.
    pastas = {f["id"]: {"nome": f.get("name", ""), "pais": f.get("parents", [])}
              for f in _paginar(
                  svc,
                  q="mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                  fields="nextPageToken, files(id, name, parents)")}

    cache = {}

    def caminho_de(pais, prof=0):
        if not pais or prof > 15:
            return ""
        pid = pais[0]
        if pid in cache:
            return cache[pid]
        p = pastas.get(pid)
        if not p:                      # pasta acima do que a conta enxerga
            return ""
        valor = caminho_de(p["pais"], prof + 1) + "/" + p["nome"]
        cache[pid] = valor
        return valor

    saida = []
    for f in arquivos:
        if not f["name"].lower().endswith(EXTENSOES):
            continue  # "contains" tambem pega .pbix.tmp e afins
        caminho = caminho_de(f.get("parents", [])) + "/" + f["name"]
        saida.append({
            "arquivo_id": f["id"],
            "nome": f["name"],
            "empresa": empresa_do_caminho(caminho),
            "caminho": caminho,
            "categoria": classificar(caminho),
            "modificado_em": f.get("modifiedTime"),
            "tamanho_bytes": int(f.get("size") or 0),
        })
    return apenas_mais_recentes(saida)
