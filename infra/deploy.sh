#!/usr/bin/env bash
set -euo pipefail
PROJECT=${GCP_PROJECT_ID:-$(gcloud config get-value project)}
REGION=${REGION:-southamerica-east1}
SA_EMAIL="bi-ingestor@${PROJECT}.iam.gserviceaccount.com"
IMAGEM="${REGION}-docker.pkg.dev/${PROJECT}/cloud-run-source-deploy/bi-ingestor"

echo ">> Build da imagem do ingestor (usa ingestor/Dockerfile, contexto na raiz)..."
# Buildpack não serve aqui: requirements.txt fica em ingestor/, não na raiz.
cat > /tmp/cloudbuild-ingestor.yaml <<EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-f', 'ingestor/Dockerfile', '-t', '${IMAGEM}', '.']
images:
  - '${IMAGEM}'
EOF
gcloud builds submit . --config /tmp/cloudbuild-ingestor.yaml --project "$PROJECT"

echo ">> Cloud Run Job..."
gcloud run jobs deploy bi-ingestor --project "$PROJECT" --region "$REGION" \
  --image "$IMAGEM" --service-account "$SA_EMAIL" \
  --set-env-vars "GCP_PROJECT_ID=$PROJECT" --max-retries 1 --task-timeout 3600 --quiet

echo ">> Scheduler de hora em hora..."
gcloud scheduler jobs create http bi-ingestor-hourly --project "$PROJECT" \
  --location "$REGION" --schedule "0 * * * *" \
  --uri "https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/bi-ingestor:run" \
  --http-method POST --oauth-service-account-email "$SA_EMAIL" 2>/dev/null || echo "   scheduler já existe"
# O Scheduler chama a API do Cloud Run como a própria SA; sem isto o disparo dá 403.
gcloud run jobs add-iam-policy-binding bi-ingestor --project "$PROJECT" --region "$REGION" \
  --member "serviceAccount:$SA_EMAIL" --role roles/run.invoker --quiet >/dev/null

echo ">> Functions + Hosting..."
(cd app && npm install && npm run build)
firebase deploy --project "$PROJECT" --only functions,hosting

echo ">> Liberando as functions para o Hosting encaminhar as chamadas..."
# A autenticação real acontece dentro da function (token Firebase); esta permissão
# só permite que a requisição chegue até lá. Exige que a org permita allUsers.
for SVC in api ask; do
  gcloud run services add-iam-policy-binding "$SVC" --project "$PROJECT" --region "$REGION" \
    --member allUsers --role roles/run.invoker --quiet >/dev/null ||
    echo "   AVISO: não consegui liberar '$SVC' (política da organização?). O app dará 401."
done

echo ">> Pronto. Primeira ingestão: gcloud run jobs execute bi-ingestor --region $REGION"
