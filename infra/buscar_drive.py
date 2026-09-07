"""Procura a pasta de exportacao (Dados_Bi) de um cliente no Google Drive.

Le o indice local do Google Drive para Desktop, entao responde na hora e sem
consumir quota da API. Quando o nome pedido nao existe, sugere os parecidos —
que e o caso comum: a pasta esta gravada como "Din�mica" e se procura "dinamica".

Uso:
    python3 infra/buscar_drive.py "nome do cliente"
    python3 infra/buscar_drive.py --listar
"""
import difflib
import glob
import os
import shutil
import sqlite3
import sys
import tempfile
import unicodedata

RAIZ_DRIVEFS = os.path.expandvars(r"%LOCALAPPDATA%\Google\DriveFS")
PREFIXOS_EXPORT = ("dados_bi", "dados bi")


def normalizar(txt):
    txt = unicodedata.normalize("NFKD", txt or "")
    txt = "".join(c for c in txt if not unicodedata.combining(c))
    return txt.lower().strip()


def banco_do_drive():
    padrao = os.path.join(RAIZ_DRIVEFS, "*", "metadata_sqlite_db")
    achados = glob.glob(padrao)
    if not achados:
        sys.exit("indice do Drive para Desktop nao encontrado em " + RAIZ_DRIVEFS)
    return max(achados, key=os.path.getmtime)


def carregar_pastas():
    """Devolve [(id, caminho)] das pastas de exportacao visiveis no Drive."""
    origem = banco_do_drive()
    # O Drive mantem o arquivo aberto; copiar evita disputa de lock.
    copia = os.path.join(tempfile.gettempdir(), "drivefs_busca.db")
    shutil.copy2(origem, copia)
    con = sqlite3.connect(copia)
    cur = con.cursor()
    cur.execute("SELECT stable_id, id, local_title FROM items WHERE is_folder=1 AND trashed=0")
    itens = {r[0]: {"id": r[1], "nome": r[2] or ""} for r in cur.fetchall()}
    cur.execute("SELECT item_stable_id, parent_stable_id FROM stable_parents")
    pai = {}
    for filho, p in cur.fetchall():
        pai.setdefault(filho, p)
    con.close()

    def caminho(sid, prof=0):
        if prof > 12 or sid not in itens:
            return ""
        acima = pai.get(sid)
        return (caminho(acima, prof + 1) if acima else "") + "/" + itens[sid]["nome"]

    return [(v["id"], caminho(sid))
            for sid, v in itens.items()
            if normalizar(v["nome"]).startswith(PREFIXOS_EXPORT)]


def empresa(caminho):
    """'/Empresas/Dinamica/Dados_Bi' -> 'Dinamica'."""
    partes = [p for p in caminho.split("/") if p]
    return partes[-2] if len(partes) >= 2 else caminho


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    pastas = carregar_pastas()

    if sys.argv[1] == "--listar":
        for fid, caminho in sorted(pastas, key=lambda x: x[1]):
            print(f"{fid}\t{caminho}")
        print(f"\n{len(pastas)} pastas de exportacao")
        return

    alvo = normalizar(" ".join(sys.argv[1:]))
    exatos = [(f, c) for f, c in pastas if alvo in normalizar(c)]
    if exatos:
        print(f"{len(exatos)} pasta(s) para '{alvo}':\n")
        for fid, caminho in sorted(exatos, key=lambda x: x[1]):
            print(f"  drive_folder_id: {fid}")
            print(f"  empresa:         {empresa(caminho)}")
            print(f"  caminho:         {caminho}\n")
        return

    nomes = {empresa(c): (f, c) for f, c in pastas}
    parecidos = difflib.get_close_matches(alvo, [normalizar(n) for n in nomes], n=5, cutoff=0.4)
    print(f"nenhuma pasta com '{alvo}'.")
    if parecidos:
        print("\nnomes parecidos:")
        for p in parecidos:
            for nome, (fid, caminho) in nomes.items():
                if normalizar(nome) == p:
                    print(f"  {nome}  ->  {fid}  ({caminho})")
    else:
        print("Use --listar para ver todas as pastas.")


if __name__ == "__main__":
    main()
