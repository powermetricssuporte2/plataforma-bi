"""Deploy do Firebase Hosting pela API REST, usando o token do gcloud.
Serve quando a sessao do firebase-tools expira mas a do gcloud continua valida."""
import gzip, hashlib, io, json, os, sys, urllib.request

SITE = "powermetrics-bi"
REGIAO = "southamerica-east1"
RAIZ = os.path.join("app", "dist")
API = "https://firebasehosting.googleapis.com/v1beta1"

tok = os.environ.get("GCLOUD_TOKEN", "").strip()
if not tok:
    sys.exit("Defina GCLOUD_TOKEN:  export GCLOUD_TOKEN=\"$(gcloud auth print-access-token)\"")

def req(url, metodo="GET", corpo=None, tipo="application/json", cru=False):
    dados = corpo if cru else (json.dumps(corpo).encode() if corpo is not None else None)
    r = urllib.request.Request(url, data=dados, method=metodo)
    r.add_header("Authorization", "Bearer " + tok)
    r.add_header("x-goog-user-project", SITE)
    if dados is not None:
        r.add_header("Content-Type", tipo)
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            return json.loads(txt) if txt.strip() else {}
    except urllib.error.HTTPError as e:
        print("ERRO", e.code, url, file=sys.stderr)
        print(e.read().decode()[:800], file=sys.stderr)
        raise

# 1. arquivos -> gzip -> sha256
arquivos = {}
for base, _, nomes in os.walk(RAIZ):
    for n in nomes:
        caminho = os.path.join(base, n)
        rel = "/" + os.path.relpath(caminho, RAIZ).replace(os.sep, "/")
        bruto = open(caminho, "rb").read()
        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0) as g:
            g.write(bruto)
        comp = buf.getvalue()
        arquivos[rel] = (hashlib.sha256(comp).hexdigest(), comp)
print(f"{len(arquivos)} arquivos preparados")

# 2. cria versao com a mesma config do firebase.json
cfg = json.load(open("firebase.json"))["hosting"]

# O firebase.json usa "source"/"destination"; a API REST usa "glob"/"path",
# e espera os headers como objeto simples em vez de lista de {key, value}.
rewrites = []
for r in cfg.get("rewrites", []):
    novo_r = {"glob": r.get("source", r.get("glob"))}
    if "function" in r:
        # Functions v2 sao servicos Cloud Run: o rewrite precisa apontar para o
        # servico e a regiao, senao a chamada cai no catch-all e devolve HTML.
        novo_r["run"] = {"serviceId": r["function"], "region": REGIAO}
    elif "destination" in r:
        novo_r["path"] = r["destination"]
    rewrites.append(novo_r)

headers = [{"glob": h.get("source", h.get("glob")),
            "headers": {i["key"]: i["value"] for i in h.get("headers", [])}}
           for h in cfg.get("headers", [])]

versao = req(f"{API}/sites/{SITE}/versions", "POST",
             {"config": {"rewrites": rewrites, "headers": headers}})
nome = versao["name"]
print("versao:", nome)

# 3. informa os hashes
pop = req(f"{API}/{nome}:populateFiles", "POST",
          {"files": {p: h for p, (h, _) in arquivos.items()}})
faltando = pop.get("uploadRequiredHashes", []) or []
url_up = pop.get("uploadUrl")
print("faltando enviar:", len(faltando))

# 4. sobe o que falta
por_hash = {h: c for (h, c) in arquivos.values()}
for h in faltando:
    req(f"{url_up}/{h}", "POST", por_hash[h], tipo="application/octet-stream", cru=True)
print("upload concluido")

# 5. finaliza e publica
req(f"{API}/{nome}?updateMask=status", "PATCH", {"status": "FINALIZED"})
rel = req(f"{API}/sites/{SITE}/releases?versionName={nome}", "POST", {})
print("publicado:", rel.get("name"))
