# Firebase deployment setup

Cloud deployment is gated until two real Firebase projects, billing, and GitHub OIDC are configured. Local emulator tests do not require billing. No cloud projects or live accounts are created by installing dependencies.

## 1. Sign in and enable billing

Install the Google Cloud CLI from its official site. In Git Bash, run `gcloud auth login`, `gcloud auth application-default login`, and `npx firebase login`. Complete Google sign-in yourself. Create a billing account in Google Cloud Billing, then get its ID with `gcloud billing accounts list`. Do not paste credentials, passwords, or payment details into chat or repository files.

Pick two globally unique project IDs. The following commands create/link resources and billing; substitute the actual IDs and billing account:

```bash
bash scripts/setup-cloud.sh development YOUR_DEV_PROJECT BILLING_ACCOUNT_ID
bash scripts/setup-cloud.sh production YOUR_PROD_PROJECT BILLING_ACCOUNT_ID
```

The script creates regional Firestore and private Cloud Storage in `us-central1`, enables required services, and configures separate runtime/deployment identities. Its GitHub trust condition includes repository ID, owner ID, branch, and environment. It creates no service-account keys. It must be run by an account allowed to create projects, link billing, and administer IAM. Cloud execution remains unverified until run against those accounts.

## 2. Firebase Auth and web apps

For each project in Firebase Console:

1. Initialize Authentication and enable Email/Password, with email enumeration protection. Disable client account creation/deletion through Identity Platform client permissions if available. Regardless of that setting, the application only accepts accounts with an administratively provisioned enabled profile; users cannot create or alter their own profiles.
2. Add a web app named Soundroom. Copy its public web configuration JSON. Ensure `storageBucket` is `PROJECT_ID.firebasestorage.app`.
3. Add authorized domains: production `nicholasfmathison.github.io`; development `PROJECT_ID.web.app` and `localhost`. Keep each project's default Firebase Auth domain.
4. Create a default Firebase Hosting site for the development project if the project does not already have one (`npx firebase hosting:sites:create YOUR_DEV_PROJECT --project YOUR_DEV_PROJECT`). Production frontend hosting stays on GitHub Pages.
5. Provision the personal account separately in both projects:

```bash
node functions/scripts/provision-user.mjs YOUR_DEV_PROJECT YOUR_EMAIL YOUR_USERNAME
node functions/scripts/provision-user.mjs YOUR_PROD_PROJECT YOUR_EMAIL YOUR_USERNAME
```

This creates a UUID Auth UID and matching private profile. A random initial password is never printed. Use **Forgot your password?** on each deployed environment to set a password. The script will not rename an existing profile or silently convert a non-UUID account.

## 3. GitHub environment variables

Create GitHub environments **development** (deployment branch `dev`) and **production** (deployment branch `main`). Keep **github-pages** restricted to `main` as it already is. Add these environment variables using the values printed by the setup script:

| Variable | Value |
| --- | --- |
| `FIREBASE_PROJECT_ID` | This environment's project ID |
| `FIREBASE_WEB_CONFIG` | Full public Firebase web configuration JSON |
| `FIREBASE_RUNTIME_SERVICE_ACCOUNT` | `soundroom-runtime@PROJECT_ID.iam.gserviceaccount.com` |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | `soundroom-deploy@PROJECT_ID.iam.gserviceaccount.com` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full provider resource name printed by setup |

After both environments are configured, set repository variable `FIREBASE_READY` to `true`. These are identifiers and public configuration, not passwords or secrets. The workflow obtains short-lived Google credentials through OIDC and ignores the temporary credential files. Never put a service-account key in `VITE_*` variables.

## 4. Release and verify

Push `dev` and verify its workflow: emulator tests, deployment, health commit SHA, unauthorized access denial, and preview at `https://DEV_PROJECT.web.app/`. Check login, WAV/MP3 uploads, playback, history, and pagination. Firebase may need time to finish building indexes on the first deployment; wait for them to become ready before the smoke test of library queries.

Then merge `dev` into `main`. The workflow deploys the production backend first and only publishes GitHub Pages after API verification succeeds. The production frontend stays at `https://nicholasfmathison.github.io/myactualnewapp/`. Check it with the production account. Verify a dev token is rejected by production and that each library has separate data. Return local checkout to `dev`.

The scheduled cleanup job removes only incomplete uploads using indexed save-operation records and exact object references; it never lists bucket objects and never deletes saved historical versions. Verify Cloud Scheduler can invoke the deployed cleanup function and that runtime identity has `iam.serviceAccounts.signBlob` on itself for signed URLs. API logs exclude request bodies, credentials, filenames, and signed links.

Use Google Cloud budget alerts for each project. A maximum of two API instances limits compute concurrency but is not a spending cap. Keep the dev and production accounts and storage separate. Do not enable storage object-versioning: application history already keeps explicit immutable audio objects.

## Rollback and maintenance

Revert the offending commit and push the same branch to redeploy a previous compatible API/UI. Saves are additive and immutable; rollback does not delete stored versions. Treat future changes to the Firestore record format as migrations. Record-format changes must remain compatible while the new backend deploys before the frontend. Review Firebase runtime support before Node 22 reaches end of support.

`npm audit --omit=dev` is clean for frontend and backend dependencies at implementation time. The Firebase CLI's development-only dependency tree currently has moderate upstream advisories; do not use `npm audit fix --force`, which proposes an obsolete CLI downgrade.
