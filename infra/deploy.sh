#!/usr/bin/env bash
set -euo pipefail
PROJECT=${GCP_PROJECT_ID:-$(gcloud config get-value project)}
REGION=${REGION:-southamerica-east1}
SA_EMAIL="bi-ingestor@${PROJECT}.iam.gserviceaccount.com"

echo ">> Build + deploy do Cloud Run Job (ingestor)..."
gcloud run jobs deploy bi-ingestor --project "$PROJECT" --region "$REGION" \
  --source . --command python --args ingestor/main.py \
  --service-account "$SA_EMAIL" --set-env-vars "GCP_PROJECT_ID=$PROJECT" \
  --max-retries 1 --task-timeout 3600 2>/dev/null || \
gcloud run jobs update bi-ingestor --project "$PROJECT" --region "$REGION" \
  --source . --service-account "$SA_EMAIL"

echo ">> Scheduler de hora em hora..."
gcloud scheduler jobs create http bi-ingestor-hourly --project "$PROJECT" \
  --location "$REGION" --schedule "0 * * * *" \
  --uri "https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/bi-ingestor:run" \
  --http-method POST --oauth-service-account-email "$SA_EMAIL" 2>/dev/null || echo "   scheduler já existe"

echo ">> Functions + Hosting..."
(cd app && npm install && npm run build)
firebase deploy --project "$PROJECT" --only functions,hosting

echo ">> Pronto. Rode a primeira ingestão com: gcloud run jobs execute bi-ingestor --region $REGION"
