# Soundroom

A private WAV/MP3 library with email/password login, 24-at-a-time browsing, exact-title search, playback, downloads, and immutable saved-version history. Built with React 19, TypeScript 5.8, Tailwind CSS 3, Firebase Authentication, Firestore, Cloud Storage, and Node.js 22 Cloud Functions.

## Run locally in Git Bash

Install Node.js 22 and Java 21 for Firebase's emulators. The frontend also runs on the installed Node 26, but use Node 22 for backend development and emulator testing.

```bash
npm ci
npm ci --prefix functions
npm run setup:local
npm run build:api
npm run emulators
```

In a second terminal:

```bash
npm run seed:local
npm run dev
```

Open http://localhost:5173/myactualnewapp/. Sign in with the **local-only** test account `demo@example.test` / `Soundroom-local-only!`. It exists only in the emulators. Emulator data is temporary and resets on restart; do not use it as permanent storage for your recordings. The emulator console is at http://127.0.0.1:4000/.

Generated environment files, credentials, emulator logs, dependencies, and build output are ignored by Git. Local testing never uploads audio to a real Firebase project.

## Validation

```bash
npm run check
npm run build
npm run build:api
# Stop separately running emulators before this command:
npm run test:integration
```

The integration suite uses real Auth, Firestore, and Storage emulators plus an HTTP server running the same Express API. Tests generate their own WAV and MP3 fixtures. It covers authorization, file validation, signed-link emulation, saved history, retries, concurrency, pagination, cleanup, and direct-access denial. Emulators do not enforce production composite-index requirements or verify cloud IAM: those need deployment smoke tests.

## API

All routes except `GET /v1/health` require `Authorization: Bearer FIREBASE_ID_TOKEN` for an enabled, administratively provisioned UUID account. Login, reset, and refresh use Firebase Authentication's SDK/endpoints. The app has no signup interface and never stores password hashes in Firestore.

| Route | Result |
| --- | --- |
| `GET /v1/auth/me` | Approved profile |
| `POST /v1/auth/logout` | Revoke refresh tokens |
| `GET /v1/tracks/latest?cursor=…` | Latest tracks, 24 per page |
| `GET /v1/tracks?title=…&cursor=…` | Full normalized-title match, duplicates distinguished by ID |
| `GET /v1/tracks/:id` | Current track |
| `GET /v1/tracks/:id/versions?cursor=…` | History, 24 per page |
| `GET /v1/tracks/:id/versions/:versionId` | Historical snapshot and fresh audio URL |
| `POST /v1/tracks` | Create track |
| `PUT /v1/tracks/:id` | Save a new version |

Save requests use multipart fields `title` (1–160 characters), `description` (0–5,000), and `file` (required for create; optional for update). Maximum file size is 10,000,000 bytes. Both save routes require a UUID `Idempotency-Key`; updates also require `If-Match` containing the current version UUID. Keep the same key when retrying an unchanged request. A `409 VERSION_CONFLICT` requires reloading the track; a `409 SAVE_IN_PROGRESS` means retry later. Failed/interrupted uploads are cleaned by a scheduled job before the same key can be retried.

Lists return `{items, nextCursor}`. Track responses contain `id`, `userId`, `versionId`, `title`, `description`, `createdAt`, `savedAt`, audio metadata, `audioUrl`, and `audioUrlExpiresAt`. URLs expire after 15 minutes in production. Audio is loaded only on Listen; requesting a version refreshes its URL. Signed URLs are temporary bearer access, so don't share them unless you intend to share that recording. Errors use `{error: {code, message}}`.

## Storage behavior

Profiles live at `users/{UUID}`; tracks at `users/{UUID}/tracks/{trackUUID}`; immutable versions below each track. Exact paths are stored with each version. The bucket is private and the client cannot read/write Firestore directly.

Audio paths are `username/original-title--trackUUID/saveTimestamp--versionUUID.wav` (or `.mp3`). Username and original folder slug remain fixed when a track is renamed. Changed explicit saves create versions; metadata-only saves share the same audio object; identical saves do nothing. No daily snapshots, bucket listings, offset paging, or full-library scans. Old versions are retained indefinitely. Pagination is a live view: after concurrent edits, refresh the list to see items moved to its beginning.

## Deployment

**Currently local-only:** cloud deployment is disabled. The future spending target is USD 10/month combined across dev and production; no Google budget or hard cap has been installed. The checked-in spending policy blocks setup/deployment until the owner explicitly approves cloud spending and safeguards are verified.

See [Firebase setup](docs/firebase-setup.md) for billing, projects, account provisioning, and GitHub OIDC configuration. **Live cloud deployment requires that setup; an emulator test is not proof of a live Firebase deployment.**

The workflow tests pushes and pull requests. With the spending policy approved and repository variable `FIREBASE_READY=true`, `dev` deploys to a separate Firebase project and preview website; `main` deploys the production backend, then GitHub Pages. Production remains https://nicholasfmathison.github.io/myactualnewapp/. Each environment is isolated through its Firebase project and branch-bound deployment identity. No long-lived deployment key is required.

Pitch detection/shifting, recording, sharing, deletion, retention limits, and bulk import are outside v1.
