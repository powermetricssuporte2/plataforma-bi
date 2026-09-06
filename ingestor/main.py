"""Ingestor Drive -> BigQuery. Roda como Cloud Run Job (Scheduler 1x/h) ou local."""
import argparse
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import yaml

from diff import needs_ingest
from loader import BQLoader, new_run_id, now_iso
from source import DriveCSVSource

PROJECT = os.environ.get("GCP_PROJECT_ID") or os.environ.get("GOOGLE_CLOUD_PROJECT")
CFG = os.path.join(os.path.dirname(__file__), "..", "config", "clientes.yaml")


def drive_service():
    from google.auth import default
    from googleapiclient.discovery import build
    creds, _ = default(scopes=["https://www.googleapis.com/auth/drive.readonly"])
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def run_cliente(loader: BQLoader, svc, cliente: dict, forcar: bool = False) -> bool:
    cid, folder = cliente["id"], cliente["drive_folder_id"]
    # Pasta nao compartilhada ou dataset indisponivel nao pode derrubar os demais
    # clientes do mesmo run: registra o erro e segue para o proximo.
    try:
        # Confere o acesso ao Drive antes de criar dataset: cliente sem
        # compartilhamento nao deve deixar dataset vazio nem aparecer no seletor.
        src = DriveCSVSource(folder, svc)
        refs = src.list_tables()
        # A API do Drive nao acusa erro quando a service account nao enxerga a
        # pasta: devolve lista vazia. Sem isto o cliente ficaria silenciosamente
        # sem dados, parecendo que rodou bem.
        if not refs:
            raise RuntimeError(
                "nenhuma tabela visivel — compartilhe a pasta com a service account (Leitor)")
        loader.bq.create_dataset(f"{loader.project}.{cid}", exists_ok=True)
        loader.registrar_cliente(cid, cliente.get("nome", cid))
    except Exception as e:
        loader.log(new_run_id(), cid, "-", "ERRO", 0, f"acesso ao cliente: {e}", now_iso())
        loader.alert(cid, f"Sem acesso a pasta do Drive ({folder}): {e}")
        print(f"[{cid}] ERRO de acesso: {e}", file=sys.stderr)
        return False
    print(f"[{cid}] {len(refs)} tabelas na whitelist encontradas no Drive")
    ok = True
    for ref in refs:
        started = now_iso()
        try:
            if not forcar and not needs_ingest(ref.modified, loader.last_success(cid, ref.name)):
                print(f"[{cid}] {ref.name}: sem mudança, pulando")
                continue
            raw = src.fetch_table(ref)
            n = loader.load_table(cid, ref.name, raw)
            loader.log(new_run_id(), cid, ref.name, "OK", n, None, started)
            print(f"[{cid}] {ref.name}: {n} linhas")
        except Exception as e:  # erro por tabela não derruba o run
            ok = False
            loader.log(new_run_id(), cid, ref.name, "ERRO", 0, str(e), started)
            loader.alert(cid, f"Falha em {ref.name}: {e}")
            print(f"[{cid}] {ref.name}: ERRO {e}", file=sys.stderr)
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cliente", help="rodar só um cliente (id)")
    ap.add_argument("--forcar", action="store_true",
                    help="recarrega tudo, ignorando o diff por modifiedTime")
    args = ap.parse_args()

    with open(CFG) as f:
        clientes = [c for c in yaml.safe_load(f)["clientes"] if c.get("ativo")]
    if args.cliente:
        clientes = [c for c in clientes if c["id"] == args.cliente]
    if not clientes:
        sys.exit("Nenhum cliente ativo selecionado")

    loader = BQLoader(PROJECT)
    loader.ensure_meta()

    # Um cliente por vez levava horas com a carteira inteira, e o trabalho e
    # quase todo espera de rede (download do Drive, carga no BigQuery).
    # O cliente do googleapiclient nao e thread-safe: cada thread cria o seu.
    local = __import__("threading").local()

    def processar(cliente):
        if not hasattr(local, "svc"):
            local.svc = drive_service()
        return run_cliente(loader, local.svc, cliente, forcar=args.forcar)

    with ThreadPoolExecutor(max_workers=4) as pool:
        resultados = list(pool.map(processar, clientes))
    sys.exit(0 if all(resultados) else 1)


if __name__ == "__main__":
    main()
