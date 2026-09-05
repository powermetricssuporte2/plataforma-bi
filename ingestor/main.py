"""Ingestor Drive -> BigQuery. Roda como Cloud Run Job (Scheduler 1x/h) ou local."""
import argparse
import os
import sys

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


def run_cliente(loader: BQLoader, svc, cliente: dict) -> bool:
    cid, folder = cliente["id"], cliente["drive_folder_id"]
    loader.bq.create_dataset(f"{loader.project}.{cid}", exists_ok=True)
    src = DriveCSVSource(folder, svc)
    refs = src.list_tables()
    print(f"[{cid}] {len(refs)} tabelas na whitelist encontradas no Drive")
    ok = True
    for ref in refs:
        started = now_iso()
        try:
            if not needs_ingest(ref.modified, loader.last_success(cid, ref.name)):
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
    args = ap.parse_args()

    with open(CFG) as f:
        clientes = [c for c in yaml.safe_load(f)["clientes"] if c.get("ativo")]
    if args.cliente:
        clientes = [c for c in clientes if c["id"] == args.cliente]
    if not clientes:
        sys.exit("Nenhum cliente ativo selecionado")

    loader = BQLoader(PROJECT)
    loader.ensure_meta()
    svc = drive_service()
    all_ok = all([run_cliente(loader, svc, c) for c in clientes])
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
