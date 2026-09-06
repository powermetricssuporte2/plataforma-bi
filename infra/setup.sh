#!/usr/bin/env bash
# Idempotente. Requer: gcloud logado com Owner/Editor + billing ativo no projeto.
set -euo pipefail
PROJECT=${GCP_PROJECT_ID:-$(gcloud config get-value project)}
REGION=${REGION:-southamerica-east1}
SA_NAME=bi-ingestor
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"

echo ">> Habilitando APIs..."
gcloud services enable drive.googleapis.com bigquery.googleapis.com run.googleapis.com \
  cloudscheduler.googleapis.com secretmanager.googleapis.com cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com --project "$PROJECT"

echo ">> Service account..."
gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT" \
  --display-name "BI Ingestor" 2>/dev/null || true
for ROLE in roles/bigquery.dataEditor roles/bigquery.jobUser; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member "serviceAccount:$SA_EMAIL" --role "$ROLE" --quiet >/dev/null
done

echo ">> Secret da API Anthropic (cole a chave e Enter, Ctrl+D):"
gcloud secrets create ANTHROPIC_API_KEY --project "$PROJECT" --data-file=- 2>/dev/null || \
  echo "   (secret já existe — para trocar: gcloud secrets versions add ANTHROPIC_API_KEY --data-file=-)"

echo ">> Datasets BigQuery..."
python3 - << PYEOF
import yaml
from google.cloud import bigquery
bq = bigquery.Client(project="$PROJECT", location="$REGION")
bq.create_dataset("$PROJECT._meta", exists_ok=True)
for c in yaml.safe_load(open("config/clientes.yaml"))["clientes"]:
    if c.get("ativo"):
        bq.create_dataset(f"$PROJECT.{c['id']}", exists_ok=True)
        print("dataset ok:", c["id"])
PYEOF

echo ""
echo "=============================================================="
echo "AÇÃO MANUAL OBRIGATÓRIA:"
echo "Compartilhe as pastas do Drive dos clientes (permissão Leitor) com:"
echo ""
echo "    $SA_EMAIL"
echo ""
echo "Drive > pasta > Compartilhar > colar o e-mail acima > Leitor"
echo "=============================================================="
