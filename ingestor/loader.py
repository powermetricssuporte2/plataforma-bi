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
          CREATE TABLE IF NOT EXISTS `{ds}.clientes`(
            id STRING, nome STRING);
          -- Correcoes feitas na tela; sobrevivem a reescrita do inventario.
          CREATE TABLE IF NOT EXISTS `{ds}.relatorios_ajustes`(
            arquivo_id STRING, empresa STRING, oculto BOOL,
            ajustado_por STRING, ajustado_em TIMESTAMP);
          CREATE TABLE IF NOT EXISTS `{ds}.relatorios`(
            arquivo_id STRING, nome STRING, empresa STRING, caminho STRING,
            categoria STRING, modificado_em TIMESTAMP, tamanho_bytes INT64,
            visto_em TIMESTAMP);
        """).result()

    def salvar_relatorios(self, itens):
        """Substitui o inventario de .pbix pelo estado atual do Drive.

        Reescrever a tabela inteira e mais simples e mais correto que atualizar
        linha a linha: relatorio apagado ou movido no Drive precisa sumir daqui.
        """
        tabela = f"{self.project}._meta.relatorios"
        agora = now_iso()
        linhas = [dict(i, visto_em=agora) for i in itens]
        cfg = self.bigquery.LoadJobConfig(
            write_disposition=self.bigquery.WriteDisposition.WRITE_TRUNCATE,
            schema=[
                self.bigquery.SchemaField("arquivo_id", "STRING"),
                self.bigquery.SchemaField("nome", "STRING"),
                self.bigquery.SchemaField("empresa", "STRING"),
                self.bigquery.SchemaField("caminho", "STRING"),
                self.bigquery.SchemaField("categoria", "STRING"),
                self.bigquery.SchemaField("modificado_em", "TIMESTAMP"),
                self.bigquery.SchemaField("tamanho_bytes", "INT64"),
                self.bigquery.SchemaField("visto_em", "TIMESTAMP"),
            ])
        self.bq.load_table_from_json(linhas, tabela, job_config=cfg).result()
        return len(linhas)

    def registrar_cliente(self, cid: str, nome: str):
        """Espelha config/clientes.yaml no BigQuery para o app exibir nomes."""
        q = f"""MERGE `{self.project}._meta.clientes` T
                USING (SELECT @id id, @nome nome) S ON T.id = S.id
                WHEN MATCHED THEN UPDATE SET nome = S.nome
                WHEN NOT MATCHED THEN INSERT (id, nome) VALUES (S.id, S.nome)"""
        self.bq.query(q, job_config=self.bigquery.QueryJobConfig(
            query_parameters=[
                self.bigquery.ScalarQueryParameter("id", "STRING", cid),
                self.bigquery.ScalarQueryParameter("nome", "STRING", nome)])).result()

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
        """Carrega o CSV com os nomes do cabecalho e todas as colunas STRING.

        O autodetect do BigQuery e enganoso aqui: quando o arquivo inteiro
        parece texto ele decide que nao ha cabecalho e nomeia as colunas
        string_field_0, string_field_1..., o que quebra as views; e quando
        acerta o cabecalho ainda erra o tipo de colunas como codigo de barras,
        que trazem "SEM GTIN" no meio de numeros. Definir o schema a partir do
        cabecalho resolve os dois casos, e as views convertem com
        pm_num()/pm_date().
        """
        text = decode_csv(raw)
        dest = f"{self.project}.{cliente}.{tabela}"
        primeira = text.splitlines()[0] if text.splitlines() else ""
        cabecalho = primeira.lstrip("﻿").strip().split(";")
        colunas = [c.strip().strip('"') for c in cabecalho]
        schema = [self.bigquery.SchemaField(c, "STRING") for c in colunas if c]
        if not schema:
            raise ValueError("cabecalho vazio no CSV")
        cfg = self.bigquery.LoadJobConfig(
            source_format=self.bigquery.SourceFormat.CSV,
            field_delimiter=";", skip_leading_rows=1, autodetect=False,
            schema=schema, allow_quoted_newlines=True,
            write_disposition=self.bigquery.WriteDisposition.WRITE_TRUNCATE)
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
