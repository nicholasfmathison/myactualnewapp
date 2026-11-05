#!/usr/bin/env bash
# Run from the repository root in Git Bash after gcloud auth login --update-adc.
set -euo pipefail
node "$(dirname "$0")/check-cloud-approval.mjs"
ENVIRONMENT="${1:?Usage: bash scripts/setup-cloud.sh development|production PROJECT_ID BILLING_ACCOUNT_ID}"
PROJECT_ID="${2:?Missing project ID}"
BILLING_ACCOUNT="${3:?Missing billing account ID}"
[[ "$ENVIRONMENT" == development || "$ENVIRONMENT" == production ]] || { echo 'Invalid environment'; exit 1; }
[[ "$PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || { echo 'Invalid project ID'; exit 1; }
[[ "$BILLING_ACCOUNT" =~ ^[A-Fa-f0-9-]+$ ]] || { echo 'Invalid billing account ID'; exit 1; }
BRANCH=dev
if [[ "$ENVIRONMENT" == production ]]; then BRANCH=main; fi
REPOSITORY=nicholasfmathison/myactualnewapp
command -v gcloud >/dev/null
gcloud auth list --filter=status:ACTIVE --format='value(account)'
if ! gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud projects create "$PROJECT_ID" --name="Soundroom $ENVIRONMENT"
fi
gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
gcloud services enable firebase.googleapis.com firebasehosting.googleapis.com firebaserules.googleapis.com firebasestorage.googleapis.com identitytoolkit.googleapis.com firestore.googleapis.com storage.googleapis.com cloudfunctions.googleapis.com run.googleapis.com compute.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com cloudscheduler.googleapis.com eventarc.googleapis.com pubsub.googleapis.com iamcredentials.googleapis.com iam.googleapis.com serviceusage.googleapis.com --project="$PROJECT_ID"
# Adding Firebase is idempotent through the project check below.
if ! npx firebase apps:list --project "$PROJECT_ID" >/dev/null 2>&1; then
  npx firebase projects:addfirebase "$PROJECT_ID"
fi
if ! gcloud firestore databases describe --database='(default)' --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud firestore databases create --database='(default)' --location=us-central1 --type=firestore-native --project="$PROJECT_ID"
fi
BUCKET="$PROJECT_ID.firebasestorage.app"
if ! gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$BUCKET" --project="$PROJECT_ID" --location=us-central1 --uniform-bucket-level-access --public-access-prevention
fi
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
# Link the bucket to Firebase. The token is passed to curl over stdin, never printed.
TOKEN="$(gcloud auth print-access-token)"
curl --fail --silent --show-error --config - >/dev/null <<EOF
url = "https://firebasestorage.googleapis.com/v1beta/projects/$PROJECT_NUMBER/buckets/$BUCKET:addFirebase"
request = "POST"
header = "Authorization: Bearer $TOKEN"
header = "Content-Type: application/json"
data = "{}"
EOF
unset TOKEN
for NAME in soundroom-deploy soundroom-runtime; do
  if ! gcloud iam service-accounts describe "$NAME@$PROJECT_ID.iam.gserviceaccount.com" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$NAME" --display-name="$NAME" --project="$PROJECT_ID"
  fi
done
DEPLOY="soundroom-deploy@$PROJECT_ID.iam.gserviceaccount.com"
RUNTIME="soundroom-runtime@$PROJECT_ID.iam.gserviceaccount.com"
for ROLE in roles/cloudfunctions.admin roles/run.admin roles/firebaserules.admin roles/firebasehosting.admin roles/datastore.indexAdmin roles/serviceusage.serviceUsageConsumer roles/firebase.viewer roles/artifactregistry.admin roles/cloudscheduler.admin roles/storage.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOY" --role="$ROLE" --condition=None --quiet >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" --member="serviceAccount:$DEPLOY" --role=roles/iam.serviceAccountUser --project="$PROJECT_ID" --quiet >/dev/null
for ROLE in roles/datastore.user roles/firebaseauth.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$RUNTIME" --role="$ROLE" --condition=None --quiet >/dev/null
done
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$RUNTIME" --role=roles/storage.objectUser >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" --member="serviceAccount:$RUNTIME" --role=roles/iam.serviceAccountTokenCreator --project="$PROJECT_ID" --quiet >/dev/null
# Default compute service account builds second-generation functions in new projects.
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" --role=roles/cloudbuild.builds.builder --condition=None --quiet >/dev/null
POOL=soundroom-github
if ! gcloud iam workload-identity-pools describe "$POOL" --location=global --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL" --location=global --display-name='Soundroom GitHub' --project="$PROJECT_ID"
fi
REPO_JSON="$(curl --fail --silent --show-error "https://api.github.com/repos/$REPOSITORY")"
REPO_ID="$(printf '%s' "$REPO_JSON" | node --input-type=module -e 'let s="";for await(const b of process.stdin)s+=b;console.log(JSON.parse(s).id)')"
OWNER_ID="$(printf '%s' "$REPO_JSON" | node --input-type=module -e 'let s="";for await(const b of process.stdin)s+=b;console.log(JSON.parse(s).owner.id)')"
CONDITION="assertion.repository_id == '$REPO_ID' && assertion.repository_owner_id == '$OWNER_ID' && assertion.ref == 'refs/heads/$BRANCH' && assertion.environment == '$ENVIRONMENT'"
if ! gcloud iam workload-identity-pools providers describe github --workload-identity-pool="$POOL" --location=global --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc github --workload-identity-pool="$POOL" --location=global --issuer-uri=https://token.actions.githubusercontent.com --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id' --attribute-condition="$CONDITION" --project="$PROJECT_ID"
else
  gcloud iam workload-identity-pools providers update-oidc github --workload-identity-pool="$POOL" --location=global --attribute-condition="$CONDITION" --project="$PROJECT_ID"
fi
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY" --role=roles/iam.workloadIdentityUser --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository_id/$REPO_ID" --project="$PROJECT_ID" --quiet >/dev/null
printf '\nCloud resources configured. Finish Auth/web-app setup in docs/firebase-setup.md.\n'
printf 'GitHub environment: %s\nFIREBASE_PROJECT_ID=%s\nFIREBASE_RUNTIME_SERVICE_ACCOUNT=%s\nGCP_DEPLOY_SERVICE_ACCOUNT=%s\nGCP_WORKLOAD_IDENTITY_PROVIDER=projects/%s/locations/global/workloadIdentityPools/%s/providers/github\n' "$ENVIRONMENT" "$PROJECT_ID" "$RUNTIME" "$DEPLOY" "$PROJECT_NUMBER" "$POOL"
