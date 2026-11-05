# Soundroom

A private audio library with microphone recording, WAV/MP3 import, email/password login, 24-at-a-time browsing, exact-title search, playback, downloads, inline renaming, audio cropping, sampler-style Tune to C, and sample deletion. Built with React 19, TypeScript 5.8, Tailwind CSS 3, Firebase Authentication, Firestore, Cloud Storage, and Node.js 22 Cloud Functions.

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
npm run test:audio
# Stop separately running emulators before this command:
npm run test:integration
```

The integration suite uses real Auth, Firestore, and Storage emulators plus an HTTP server running the same Express API. Tests generate their own WAV and MP3 fixtures. It covers authorization, file validation, signed-link emulation, replacement/deletion, legacy cleanup, retries, concurrency, pagination, cleanup, and direct-access denial. Emulators do not enforce production composite-index requirements or verify cloud IAM: those need deployment smoke tests.

## API

All routes except `GET /v1/health` require `Authorization: Bearer FIREBASE_ID_TOKEN` for an enabled, administratively provisioned UUID account. Login, reset, and refresh use Firebase Authentication's SDK/endpoints. The app has no signup interface and never stores password hashes in Firestore.

| Route | Result |
| --- | --- |
| `GET /v1/auth/me` | Approved profile |
| `POST /v1/auth/logout` | Revoke refresh tokens |
| `GET /v1/tracks/latest?cursor=…` | Latest tracks, 24 per page |
| `GET /v1/tracks?title=…&cursor=…` | Full normalized-title match, duplicates distinguished by ID |
| `GET /v1/tracks/:id` | Current track |
| `POST /v1/tracks` | Create track |
| `PUT /v1/tracks/:id` | Replace audio or update title |
| `DELETE /v1/tracks/:id` | Delete sample and its audio |

Save requests use multipart fields `title` (1–160 characters) and `file` (required for create; optional for update). Maximum file size is 10,000,000 bytes. Both save routes require a UUID `Idempotency-Key`; updates also require `If-Match` containing the current version UUID. Keep the same key when retrying an unchanged request. A `409 VERSION_CONFLICT` requires reloading the track; a `409 SAVE_IN_PROGRESS` means retry later. Failed/interrupted uploads are cleaned by a scheduled job before the same key can be retried.

Lists return `{items, nextCursor}`. Track responses contain `id`, `userId`, `versionId`, `title`, `createdAt`, `savedAt`, audio metadata, `audioUrl`, and `audioUrlExpiresAt`. URLs expire after 15 minutes in production. Audio is loaded only on Listen or when opening the trim or tuning editor; requesting the track refreshes its URL. Signed URLs are temporary bearer access, so don't share them unless you intend to share that recording. Errors use `{error: {code, message}}`.

## Record or import

**Record** is the main library action. It opens a compact recording dialog; **Start recording** requests microphone permission. Stop, listen to the preview, optionally crop, give it a title, then **Save sound**. Nothing is uploaded before Save. Closing the dialog discards an unsaved take and releases the microphone, including when permission arrives after the dialog has closed.

The small **Import audio** link in the recording dialog accepts WAV/MP3 files and uses the same preview/title/save flow. Import remains available if microphone permission is denied or no microphone is connected.

Recording uses a local AudioWorklet to capture mono PCM and exports 16-bit WAV at 48 kHz. Echo cancellation, noise suppression, and automatic gain are requested off. There is no live speaker monitoring. The audio thread stops at the 10,000,000-byte WAV limit (about 104 seconds), including if the page's UI is busy. Tracks and audio contexts are released on stop, error, or close. Microphone capture requires localhost or HTTPS and browser permission; only the selected microphone is captured, not system audio.

The audio test suite checks partial-block capture, automatic limits, permission failure, and late permission cleanup. For a browser check without hardware access, open `/myactualnewapp/tests/recording-browser.html` on the Vite dev server: it substitutes a synthetic 440 Hz microphone and offers denial/missing-device modes. This test page is not part of the production build. Hardware microphone behavior still depends on browser and OS permissions.

## Appearance

The interface uses neutral grays with red recording controls. **Fonts** beside Record opens five live type previews: **DM Sans** (default), **Inter**, **Manrope**, **Plus Jakarta Sans**, and **Geist**. Choose one to apply it throughout the interface; Done returns to the library. The selection is remembered locally in this browser.

The five variable font packages are bundled through [Fontsource](https://fontsource.org/) and served by the app, with no external font requests. Their OFL notices are included in `public/fonts/*-LICENSE.txt`. The previously used Redaction 50 assets and original license remain in `public/fonts/` but are no longer loaded by the interface.

## Trim audio

Choose the scissors button on a sound card, or **Crop audio** when adding audio. The editor uses a single grayscale Guided layout with a waveform, time grid, preview and a short gesture hint. There is no layout selector or Start/Keep/End summary panel. Drag the thick handles to trim; each has a 44 px grab target. Focus a handle and use arrow keys for 1 ms steps (Shift for 10 ms), or Home/End to reach the bounds.

Two fingers on opposite handles can adjust both ends together. Pinch elsewhere on the waveform or use a trackpad pinch to zoom; drag the waveform to pan when zoomed. **Fit whole sound** appears only while zoomed. The filled waveform uses actual sample extrema, keeping brief transients visible without stereo phase cancellation.

**Save crop** directly replaces the existing sound and closes the editor. There is no second save dialog. The pencil beside a card title renames it inline. For new uploads, **Apply trim** prepares the selected file before adding the sound.

Mono and stereo WAV/MP3 inputs are decoded locally using Web Audio. Trims export 16-bit PCM WAV, including MP3 input, without normalization, fades or pitch changes. Cut boundaries round to the nearest decoded sample. Existing tracks use their recorded sample rate; newly selected files use the browser audio context's sample rate. Output must fit the existing 10 MB limit. Only the current sound is retained. A successful replacement queues the old object for deletion; no saved history is created. The audio tests check RMS/peak math, stereo preservation, sample boundaries, WAV metadata and output limits.

Web Audio references: [decoding and resampling](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData), [bounded playback](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start).

## Tune to C

Choose **Tune to C** on a card. The compact editor shows the detected note and nearest C octave, **Preview**, and **Save**. Nothing is written until Save. Closing the editor discards the preview. Already-tuned sounds (within 3 cents) cannot be saved again unnecessarily; inconclusive sounds show “No clear, stable pitch found.”

Detection runs in a local Web Worker using YIN-style normalized difference and pitch agreement across up to 16 windows per channel. Channels are analyzed separately to avoid stereo phase cancellation. A low-pass filter precedes analysis downsampling. The detector targets stable, single-note material from 25–1800 Hz; noise, very short clips, changing notes, and complex chords can be inconclusive or ambiguous. This is a pitch estimate, not musical-key recognition or automatic correction of a pitch glide.

Tuning uses the nearest C frequency divided by the measured frequency as a fixed playback-rate ratio. Like a sampler, tuning upward shortens the sample and tuning downward lengthens it; existing pitch movement remains. Web Audio renders the result locally at the original decoded sample rate and channel count. Preview plays the same PCM16 WAV samples that Save uploads, even for MP3 input. The 10 MB output limit is checked before rendering. Save uses the existing idempotent, concurrency-protected replacement API and retires the previous audio object; no history is retained.

Audio processing stays in the browser and the current backend stays on localhost emulators. No paid processing service, cloud deployment, or new dependency is needed. Tests cover low bass, detuned tones, strong harmonics, opposite-phase stereo, decaying bass tails, noise/unstable rejection, nearest-C math, and output limits. See [Web Audio playback rate](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/playbackRate).

## Delete a sound

The small **×** in the top-right of each card opens a short confirmation. Cancel leaves the sound untouched. Delete removes the track record and its audio file, then refreshes the library. This is permanent; there is no trash or retained audio history.

The authenticated DELETE route requires the current version UUID in `If-Match`. A stale version returns 409. Deleting an already-absent track safely succeeds, so a lost response can be retried. The transaction removes metadata and durably queues the exact object path; storage deletion runs immediately. If cleanup fails, the API returns 503 CLEANUP_PENDING and the dialog offers Retry delete. The durable job also remains available to the existing cleanup worker. No storage listing is used. In-progress replacement saves cannot recreate a deleted track.

## Storage behavior

Profiles live at `users/{UUID}`; tracks at `users/{UUID}/tracks/{trackUUID}`; each track holds only its current audio object reference. The bucket is private and the client cannot read/write Firestore directly.

Audio paths remain unique (`username/original-title--trackUUID/saveTimestamp--revisionUUID.wav` or `.mp3`) to publish replacements safely. Renames reuse the current object. Replacements upload first, transactionally swap the current reference, and durably queue the old exact path in `users/{uid}/saves` with status `retired`. Deletion runs immediately and retries through the existing cleanup schedule if storage is unavailable. No bucket listing is used. Concurrent edits still use the internal `versionId` as an optimistic concurrency token; it does not represent retained history. Historical API routes are removed. Idempotent retries after a later save return the current track, never a deleted audio link.

Existing local history can be removed with `npm run build:api` followed by `node functions/scripts/remove-local-history.mjs`. The script is locked to the loopback demo project/account, processes bounded metadata pages, deletes exact retired object references, and preserves the current object. Replaced audio is not recoverable through this application.

In a future cloud rollout, disable bucket object versioning and soft-delete retention if immediate physical reclamation is required; otherwise provider retention can continue to occupy space after application deletion. No cloud configuration is changed by local cleanup.

## Deployment

**Currently local-only:** cloud deployment is disabled. The future spending target is USD 10/month combined across dev and production; no Google budget or hard cap has been installed. The checked-in spending policy blocks setup/deployment until the owner explicitly approves cloud spending and safeguards are verified.

See [Firebase setup](docs/firebase-setup.md) for billing, projects, account provisioning, and GitHub OIDC configuration. **Live cloud deployment requires that setup; an emulator test is not proof of a live Firebase deployment.**

The workflow tests pushes and pull requests. With the spending policy approved and repository variable `FIREBASE_READY=true`, `dev` deploys to a separate Firebase project and preview website; `main` deploys the production backend, then GitHub Pages. Production remains https://nicholasfmathison.github.io/myactualnewapp/. Each environment is isolated through its Firebase project and branch-bound deployment identity. No long-lived deployment key is required.

Duration-preserving pitch shifting, sharing, retention limits, and bulk import are outside v1.
