"""Exports Firebird BR costumam vir em Latin-1; tentamos UTF-8 primeiro."""


def decode_csv(raw: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    # latin-1 nunca falha; unreachable, mas por segurança:
    return raw.decode("latin-1", errors="replace")
