"""Carga no BigQuery + log em _meta."""
import io
import uuid
from datetime import datetime, timezone

from encoding import decode_csv


def now_iso():
    return datetime.now(timezone.utc).isoformat()


class BQLoader:
    def __init__(self, project: str, location: str = "southamerica-east1"):
        from google.cloud import bigquery
        self.bq = bigquery.Client(project=project, location=location)
        self.bigquery = bigquery
        self.project = project

    def ensure_meta(self):
        ds = f"{self.project}._meta"
        self.bq.create_dataset(ds, exists_ok=True)
        self.bq.query(f"""
          CREATE TABLE IF NOT EXISTS `{ds}.ingest_log`(
            run_id STRING, cliente STRING, tabela STRING, status STRING,
            linhas INT64, erro STRING, started_at TIMESTAMP, finished_at TIMESTAMP);
          CREATE TABLE IF NOT EXISTS `{ds}.alerts`(
            cliente STRING, mensagem STRING, criado_em TIMESTAMP);
        """).result()

    def last_success(self, cliente: str, tabela: str):
        q = f"""SELECT MAX(finished_at) m FROM `{self.project}._meta.ingest_log`
                WHERE cliente=@c AND tabela=@t AND status='OK'"""
        job = self.bq.query(q, job_config=self.bigquery.QueryJobConfig(
            query_parameters=[
                self.bigquery.ScalarQueryParameter("c", "STRING", cliente),
                self.bigquery.ScalarQueryParameter("t", "STRING", tabela)]))
        row = list(job.result())[0]
        return row.m.isoformat() if row.m else None

    def load_table(self, cliente: str, tabela: str, raw: bytes) -> int:
        text = decode_csv(raw)
        cfg = self.bigquery.LoadJobConfig(
            source_format=self.bigquery.SourceFormat.CSV,
            field_delimiter=";", skip_leading_rows=1, autodetect=True,
            allow_quoted_newlines=True,
            write_disposition=self.bigquery.WriteDisposition.WRITE_TRUNCATE)
        dest = f"{self.project}.{cliente}.{tabela}"
        job = self.bq.load_table_from_file(
            io.BytesIO(text.encode("utf-8")), dest, job_config=cfg)
        job.result()
        return self.bq.get_table(dest).num_rows

    def log(self, run_id, cliente, tabela, status, linhas, erro, started):
        self.bq.insert_rows_json(f"{self.project}._meta.ingest_log", [{
            "run_id": run_id, "cliente": cliente, "tabela": tabela,
            "status": status, "linhas": linhas, "erro": (erro or "")[:900],
            "started_at": started, "finished_at": now_iso()}])

    def alert(self, cliente, msg):
        self.bq.insert_rows_json(f"{self.project}._meta.alerts", [{
            "cliente": cliente, "mensagem": msg[:900], "criado_em": now_iso()}])


def new_run_id():
    return uuid.uuid4().hex[:12]
