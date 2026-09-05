"""Decide o que baixar comparando modifiedTime do Drive com o último ingest OK."""
from datetime import datetime, timezone


def parse_rfc3339(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def needs_ingest(drive_modified: str, last_success_iso: str | None) -> bool:
    if not last_success_iso:
        return True
    return parse_rfc3339(drive_modified) > parse_rfc3339(last_success_iso)
