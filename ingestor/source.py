"""Abstração de fonte de dados. Etapa 1: DriveCSVSource.
Etapa 2 (futura): FirebirdAgentSource — mesma interface, resto do sistema intacto."""
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class TableRef:
    name: str          # ex.: FCX_VENDA
    remote_id: str     # fileId no Drive
    modified: str      # RFC3339


class DataSource(ABC):
    @abstractmethod
    def list_tables(self) -> list[TableRef]: ...

    @abstractmethod
    def fetch_table(self, ref: TableRef) -> bytes: ...


class DriveCSVSource(DataSource):
    def __init__(self, folder_id: str, drive_service):
        self.folder_id = folder_id
        self.svc = drive_service

    def list_tables(self) -> list[TableRef]:
        from whitelist import should_ingest, table_from_filename
        refs, page_token = [], None
        while True:
            resp = self.svc.files().list(
                q=f"'{self.folder_id}' in parents and trashed = false",
                fields="nextPageToken, files(id, name, modifiedTime)",
                pageSize=200, pageToken=page_token,
            ).execute()
            for f in resp.get("files", []):
                if should_ingest(f["name"]):
                    refs.append(TableRef(table_from_filename(f["name"]),
                                         f["id"], f["modifiedTime"]))
            page_token = resp.get("nextPageToken")
            if not page_token:
                return refs

    def fetch_table(self, ref: TableRef) -> bytes:
        import io
        from googleapiclient.http import MediaIoBaseDownload
        buf = io.BytesIO()
        dl = MediaIoBaseDownload(buf, self.svc.files().get_media(fileId=ref.remote_id))
        done = False
        while not done:
            _, done = dl.next_chunk()
        return buf.getvalue()
