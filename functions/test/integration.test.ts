import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import type { Server } from 'node:http';
import { wav, mp3 } from './fixtures.js';
import { inspectAudio, normalizeTitle, type Track } from '../src/domain.js';
import { db, cleanupIncompleteSaves } from '../src/store.js';
import { app } from '../src/app.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw new Error('Integration tests require emulators. Run npm run test:integration from the repository root.');
const project = 'demo-soundroom';
const admin = initializeApp({ projectId: project, storageBucket: `${project}.appspot.com` });
const uid = randomUUID(); const strangerId = randomUUID(); const otherId = randomUUID();
const password = `Test-${randomUUID()}`; const email = `${uid}@example.test`;
let server: Server; let base: string; let token: string; let strangerToken: string; let otherToken: string;
let original: Track & { audioUrl: string }; let renamed: Track;
const createKey = randomUUID();
async function signIn(address: string, pass = password) {
  return fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: address, password: pass, returnSecureToken: true }),
  });
}
async function request(path: string, init: RequestInit = {}, bearer: string | null = token) {
  const response = await fetch(`${base}/v1${path}`, { ...init, headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...init.headers } });
  const body = response.status === 204 ? null : await response.json(); return { status: response.status, body };
}
async function put(title: string, options: { id?: string; version?: string; key?: string; audio?: Buffer | null; filename?: string; description?: string } = {}) {
  const form = new FormData(); form.set('title', title); form.set('description', options.description ?? 'A test recording');
  if (options.audio !== null) form.set('file', new Blob([new Uint8Array(options.audio ?? wav())]), options.filename ?? 'tone.wav');
  return request(`/tracks${options.id ? `/${options.id}` : ''}`, { method: options.id ? 'PUT' : 'POST', body: form,
    headers: { 'Idempotency-Key': options.key ?? randomUUID(), ...(options.version ? { 'If-Match': options.version } : {}) } });
}
before(async () => {
  process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
  for (const [id, approved] of [[uid, true], [strangerId, false], [otherId, true]] as const) {
    await getAuth().createUser({ uid: id, email: `${id}@example.test`, password });
    if (approved) await db().doc(`users/${id}`).set({ username: `user-${id}`, enabled: true, createdAt: new Date().toISOString() });
  }
  token = (await (await signIn(email)).json()).idToken;
  strangerToken = (await (await signIn(`${strangerId}@example.test`)).json()).idToken;
  otherToken = (await (await signIn(`${otherId}@example.test`)).json()).idToken;
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); await deleteApp(admin); });

test('login, invalid password, missing/expired tokens, and unapproved accounts', async () => {
  assert.equal((await request('/auth/me')).body.id, uid);
  assert.equal((await signIn(email, 'wrong')).status, 400);
  assert.equal((await request('/auth/me', {}, null)).status, 401);
  assert.equal((await request('/auth/me', {}, strangerToken)).status, 403);
  const parts = token.split('.'); const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); claims.exp = 1;
  parts[1] = Buffer.from(JSON.stringify(claims)).toString('base64url');
  assert.equal((await request('/auth/me', {}, parts.join('.'))).status, 401);
});
test('password-reset requests use managed Firebase endpoints', async () => {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=fake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }) });
  assert.equal(response.status, 200);
});
test('WAV metadata is extracted from bytes and upload can be played', async () => {
  const result = await put('First sound', { key: createKey }); assert.equal(result.status, 201, JSON.stringify(result.body)); original = result.body;
  assert.equal(original.audio.format, 'wav'); assert.equal(original.audio.sampleRate, 44100); assert.equal(original.audio.channels, 1);
  assert.equal(original.audio.duration, .25); assert.equal(original.audio.bytes, wav().length);
  const audio = await fetch(original.audioUrl); assert.equal(audio.status, 200); assert.deepEqual(Buffer.from(await audio.arrayBuffer()), wav());
});
test('MP3 content and duration are recognized independently of MIME', async () => {
  const audio = mp3(); const info = await inspectAudio(audio, 'generated.mp3'); assert.equal(info.format, 'mp3'); assert.ok(info.duration > 0);
  const result = await put('MP3 sound', { audio, filename: 'generated.mp3' }); assert.equal(result.status, 201, JSON.stringify(result.body));
});
test('invalid, empty, oversized audio and malformed fields are rejected', async () => {
  assert.equal((await put('bad', { audio: Buffer.from('not audio'), filename: 'fake.mp3' })).status, 415);
  assert.equal((await put('empty', { audio: Buffer.alloc(0) })).status, 413);
  assert.equal((await put('large', { audio: Buffer.alloc(10_000_001) })).status, 413);
  assert.equal((await put('')).status, 400);
  assert.equal((await put('no file', { audio: null })).status, 400);
});
test('retries return the original save and reuse of a key with different data fails', async () => {
  const retry = await put('First sound', { key: createKey }); assert.equal(retry.body.id, original.id); assert.equal(retry.body.versionId, original.versionId);
  assert.equal((await put('Different sound', { key: createKey })).status, 409);
});
test('metadata-only edits retain audio and preserve historical titles', async () => {
  const result = await put('Renamed sound', { id: original.id, version: original.versionId, audio: null }); assert.equal(result.status, 200); renamed = result.body;
  const current = (await db().doc(`users/${uid}/tracks/${original.id}`).get()).data()!;
  const old = (await db().doc(`users/${uid}/tracks/${original.id}/versions/${original.versionId}`).get()).data()!;
  assert.equal(current.objectPath, old.objectPath); assert.equal(old.title, 'First sound'); assert.notEqual(current.versionId, old.versionId);
  const resultPage = await request(`/tracks/${original.id}/versions`); assert.equal(resultPage.body.items.length, 2); assert.equal(resultPage.body.items[0].title, 'Renamed sound');
});
test('unchanged saves do not create versions and stale edits return 409', async () => {
  const noChange = await put('Renamed sound', { id: original.id, version: renamed.versionId, audio: null }); assert.equal(noChange.body.unchanged, true); assert.equal(noChange.body.versionId, renamed.versionId);
  assert.equal((await put('Stale edit', { id: original.id, version: original.versionId, audio: null })).status, 409);
});
test('audio replacement creates an object without changing the old object or folder', async () => {
  const result = await put('Another title', { id: original.id, version: renamed.versionId, audio: wav(220) }); assert.equal(result.status, 200);
  const history = await request(`/tracks/${original.id}/versions/${original.versionId}`); assert.equal(history.body.title, 'First sound');
  const oldAudio = await fetch(history.body.audioUrl); assert.deepEqual(Buffer.from(await oldAudio.arrayBuffer()), wav());
  const current = (await db().doc(`users/${uid}/tracks/${original.id}`).get()).data()!;
  assert.ok(current.objectPath.includes(`/first-sound--${original.id}/`)); renamed = result.body;
});
test('concurrent edits publish exactly one winner', async () => {
  const results = await Promise.all([put('Race A', { id: original.id, version: renamed.versionId, audio: null }), put('Race B', { id: original.id, version: renamed.versionId, audio: null })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
});
test('cross-user ID/version access and cross-user cursor reuse are denied', async () => {
  assert.equal((await request(`/tracks/${original.id}`, {}, otherToken)).status, 404);
  assert.equal((await request(`/tracks/${original.id}/versions/${original.versionId}`, {}, otherToken)).status, 404);
  assert.equal((await request('/tracks/latest', {}, otherToken)).body.items.length, 0);
});
test('25 equal-time records paginate 24 + 1 with deterministic IDs and indexed title lookup', async () => {
  const partitionUser = randomUUID(); await getAuth().createUser({ uid: partitionUser, email: `${partitionUser}@example.test`, password });
  await db().doc(`users/${partitionUser}`).set({ enabled: true, username: 'pagination' });
  const partitionToken = (await (await signIn(`${partitionUser}@example.test`)).json()).idToken;
  const source = (await db().doc(`users/${uid}/tracks/${original.id}`).get()).data()!;
  const ids = Array.from({ length: 25 }, () => randomUUID()).sort().reverse(); const batch = db().batch();
  for (const id of ids) batch.set(db().doc(`users/${partitionUser}/tracks/${id}`), { ...source, id, userId: partitionUser, title: 'Duplicate title', normalizedTitle: normalizeTitle('Duplicate title'), savedAt: '2026-01-01T00:00:00.000Z' });
  await batch.commit();
  const first = await request('/tracks/latest', {}, partitionToken); assert.equal(first.body.items.length, 24); assert.deepEqual(first.body.items.map((t: Track) => t.id), ids.slice(0, 24));
  const second = await request(`/tracks/latest?cursor=${first.body.nextCursor}`, {}, partitionToken); assert.equal(second.body.items.length, 1); assert.equal(second.body.nextCursor, null);
  assert.equal((await request(`/tracks/latest?cursor=${first.body.nextCursor}`)).status, 400);
  const search = await request('/tracks?title=DUPLICATE%20TITLE', {}, partitionToken); assert.equal(search.body.items.length, 24);
  assert.equal((await request('/tracks/latest?cursor=invalid')).status, 400);
});
test('interrupted-save cleanup targets exact object paths and leaves committed audio intact', async () => {
  const objectPath = `test/abandoned/${randomUUID()}.wav`; await getStorage().bucket().file(objectPath).save(wav());
  const op = db().doc(`users/${uid}/saves/${randomUUID()}`); await op.set({ status: 'pending', expiresAt: '2020-01-01T00:00:00.000Z', objectPath });
  await cleanupIncompleteSaves(); assert.equal((await op.get()).get('status'), 'failed'); assert.equal((await getStorage().bucket().file(objectPath).exists())[0], false);
  const saved = (await db().doc(`users/${uid}/tracks/${original.id}`).get()).data()!; assert.equal((await getStorage().bucket().file(saved.objectPath).exists())[0], true);
});
test('direct database reads and storage listing are denied by security rules', async () => {
  const firestore = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${project}/databases/(default)/documents/users/${uid}`, { headers: { Authorization: `Bearer ${token}` } }); assert.equal(firestore.status, 403);
  const storage = await fetch(`http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${project}.appspot.com/o`, { headers: { Authorization: `Bearer ${token}` } }); assert.equal(storage.status, 403);
});
test('CORS rejects unexpected origins and logout revokes old tokens', async () => {
  assert.equal((await request('/auth/me', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  // Firebase timestamps revocation in whole seconds; make this token older than the revocation instant.
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal((await request('/auth/logout', { method: 'POST' })).status, 204);
  assert.equal((await request('/auth/me')).status, 401);
});
