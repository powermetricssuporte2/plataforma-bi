import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from diff import needs_ingest


def test_primeira_carga():
    assert needs_ingest("2026-09-03T19:30:31.362Z", None)


def test_sem_mudanca():
    assert not needs_ingest("2026-09-03T19:30:31Z", "2026-09-03T20:00:00+00:00")


def test_arquivo_novo():
    assert needs_ingest("2026-09-03T21:00:00Z", "2026-09-03T20:00:00+00:00")
