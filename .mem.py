import io
p = "infra/deploy.sh"
s = io.open(p, encoding="utf-8").read()
antigo = '''  --image "$IMAGEM" --service-account "$SA_EMAIL" \
  --set-env-vars "GCP_PROJECT_ID=$PROJECT" --max-retries 1 --task-timeout 3600 --quiet'''
novo = '''  --image "$IMAGEM" --service-account "$SA_EMAIL" \
  --set-env-vars "GCP_PROJECT_ID=$PROJECT" --max-retries 1 --task-timeout 10800 \
  --memory 4Gi --cpu 2 --quiet
# 4 GB: cada CSV e lido inteiro em memoria (bytes, texto decodificado e texto
# reencodado), e sao quatro clientes em paralelo. Com o padrao de 512 MB o
# container era morto por falta de memoria no meio da carteira.'''
assert antigo in s
io.open(p, "w", encoding="utf-8").write(s.replace(antigo, novo))
print("ok")
