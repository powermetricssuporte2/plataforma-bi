import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from encoding import decode_csv

FIX = os.path.join(os.path.dirname(__file__), "fixtures")


def test_utf8():
    raw = open(os.path.join(FIX, "CAI_BANCO.csv"), "rb").read()
    text = decode_csv(raw)
    assert "BANCO ABC" in text and text.count("\n") >= 2


def test_latin1_fallback():
    raw = open(os.path.join(FIX, "latin1.csv"), "rb").read()
    text = decode_csv(raw)
    assert "JOÃO AÇÚCAR" in text
