import { randomUUID } from 'node:crypto';
import { getFirestore, FieldPath, type Query, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { decodeCursor, encodeCursor, fingerprint, HttpError, PAGE_SIZE, slug, type AudioInfo, type Track } from './domain.js';

export const db = () => getFirestore();
const bucket = () => getStorage().bucket();
export const tracks = (uid: string) => db().collection('users').doc(uid).collection('tracks');
export async function getTrack(uid: string, id: string): Promise<Track> {
  const doc = await tracks(uid).doc(id).get();
  if (!doc.exists) throw new HttpError(404, 'NOT_FOUND', 'Track not found.');
  return doc.data() as Track;
}
export async function present(track: Track) {
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  // Emulator URLs work only locally; production always uses short-lived signed URLs.
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  const emulatorToken = host ? (await bucket().file(track.objectPath).getMetadata())[0].metadata?.firebaseStorageDownloadTokens : undefined;
  const url = host ? `http://${host}/v0/b/${bucket().name}/o/${encodeURIComponent(track.objectPath)}?alt=media&token=${emulatorToken}`
    : (await bucket().file(track.objectPath).getSignedUrl({ version: 'v4', action: 'read', expires: new Date(expiresAt) }))[0];
  const { objectPath: _path, folder: _folder, normalizedTitle: _normalized, description: _description, ...data } = track as Track & { description?: string };
  return { ...data, audioUrl: url, audioUrlExpiresAt: expiresAt };
}
export async function page(uid: string, cursor: unknown, title?: string) {
  const scope = JSON.stringify([uid, '', title ?? '']);
  let query: Query = tracks(uid);
  if (title !== undefined) query = query.where('normalizedTitle', '==', title);
  query = query.orderBy('savedAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
  const after = decodeCursor(cursor, scope);
  if (after) query = query.startAfter(after.at, after.id);
  const docs = (await query.limit(PAGE_SIZE + 1).get()).docs;
  const selected = docs.slice(0, PAGE_SIZE);
  return {
    items: await Promise.all(selected.map(doc => present(doc.data() as Track))),
    nextCursor: docs.length > PAGE_SIZE ? encodeCursor(scope, { savedAt: selected.at(-1)!.get('savedAt'), id: selected.at(-1)!.id }) : null,
  };
}

interface SaveInput {
  uid: string; username: string; id?: string; key: string; expectedVersion?: string;
  details: Pick<Track, 'title' | 'normalizedTitle'>;
  file?: { buffer: Buffer; audio: AudioInfo };
}
export async function save(input: SaveInput): Promise<{ track: Track; unchanged: boolean }> {
  const { uid, details, file, key, expectedVersion } = input;
  const operation = db().collection('users').doc(uid).collection('saves').doc(key);
  const requestHash = fingerprint([input.id ?? null, details, file?.audio.sha256 ?? null, file?.audio.filename ?? null, expectedVersion ?? null]);
  const id = input.id ?? randomUUID();
  const ref = tracks(uid).doc(id);
  const lease = randomUUID();
  const reservation = await db().runTransaction(async tx => {
    const existing = await tx.get(operation);
    if (existing.exists) {
      const op = existing.data()!;
      if (op.requestHash !== requestHash) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'This save key was already used for a different request.');
      if (op.status === 'complete') return { replayId: (op.trackId ?? op.result.track.id) as string, unchanged: (op.unchanged ?? op.result?.unchanged ?? false) as boolean };
      if (op.status !== 'failed') throw new HttpError(409, 'SAVE_IN_PROGRESS', 'This save is still processing. Retry the same request shortly.');
    }
    const current = await tx.get(ref);
    const previous = current.data() as Track | undefined;
    if (input.id && !previous) throw new HttpError(404, 'NOT_FOUND', 'Track not found.');
    if (previous && previous.versionId !== expectedVersion) throw new HttpError(409, 'VERSION_CONFLICT', 'This track changed. Reload it before saving.');
    if (!previous && !file) throw new HttpError(400, 'FILE_REQUIRED', 'Choose an audio file.');
    const sameAudio = !file || (file.audio.sha256 === previous?.audio.sha256 && file.audio.filename === previous.audio.filename);
    if (previous && sameAudio && details.title === previous.title) {
      const result = { track: previous, unchanged: true };
      tx.set(operation, { status: 'complete', requestHash, trackId: previous.id, unchanged: true });
      return { result };
    }
    const savedAt = new Date(Math.max(Date.now(), previous ? Date.parse(previous.savedAt) + 1 : 0)).toISOString();
    const versionId = randomUUID();
    const folder = previous?.folder ?? `${input.username}/${slug(details.title)}--${id}`;
    const upload = !!file && !sameAudio;
    const objectPath = upload ? `${folder}/${savedAt.replace(/:/g, '-') }--${versionId}.${file.audio.format}` : previous!.objectPath;
    const track: Track = { id, userId: uid, ...details, folder, versionId, createdAt: previous?.createdAt ?? savedAt, savedAt,
      audio: upload ? file!.audio : previous!.audio, objectPath };
    tx.set(operation, { userId: uid, status: 'pending', requestHash, lease, objectPath: upload ? objectPath : null,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() });
    return { track, upload };
  });
  if ('result' in reservation) return reservation.result!;
  if ('replayId' in reservation) return { track: await getTrack(uid, reservation.replayId!), unchanged: reservation.unchanged! };
  const { track, upload } = reservation;
  try {
    if (upload) await bucket().file(track.objectPath).save(file!.buffer, { resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: track.audio.contentType, cacheControl: 'private, max-age=0',
        ...(process.env.FIREBASE_STORAGE_EMULATOR_HOST ? { metadata: { firebaseStorageDownloadTokens: randomUUID() } } : {}) } });
    const result = await db().runTransaction(async tx => {
      const [op, current] = await Promise.all([tx.get(operation), tx.get(ref)]);
      if (op.get('lease') !== lease || op.get('status') !== 'pending') throw new HttpError(409, 'SAVE_EXPIRED', 'This save expired. Try again.');
      if (input.id && !current.exists) throw new HttpError(404, 'NOT_FOUND', 'This sound was deleted.');
      if (current.exists && current.get('versionId') !== expectedVersion) throw new HttpError(409, 'VERSION_CONFLICT', 'This track changed. Reload it before saving.');
      const result = { track, unchanged: false };
      if (current.exists && current.get('objectPath') !== track.objectPath) queueRetiredAudio(tx, uid, id, current.get('objectPath'));
      tx.set(ref, track);
      tx.set(operation, { status: 'complete', requestHash, trackId: track.id, unchanged: false });
      return result;
    });
    // Publishing succeeds even if deletion is temporarily unavailable. The queued
    // exact reference remains durable for the scheduled cleanup to retry.
    await cleanupRetiredAudioForTrack(uid, id);
    return result;
  } catch (error) {
    // A transaction response can be lost after commit. Never delete committed audio.
    const current = await operation.get();
    if (current.get('status') === 'complete') return { track: await getTrack(uid, current.get('trackId') ?? current.get('result').track.id), unchanged: current.get('unchanged') ?? current.get('result')?.unchanged ?? false };
    // Leave the exact object reference for bounded cleanup; no bucket enumeration.
    await db().runTransaction(async tx => {
      const op = await tx.get(operation);
      if (op.get('lease') === lease && op.get('status') === 'pending') tx.update(operation, { expiresAt: new Date().toISOString() });
    });
    throw error;
  }
}

function queueRetiredAudio(tx: Transaction, uid: string, trackId: string, objectPath: string) {
  const ref = db().doc(`users/${uid}/saves/gc-${fingerprint(objectPath)}`);
  tx.set(ref, { status: 'retired', trackId, userId: uid, objectPath });
}

export async function removeTrack(uid: string, id: string, expectedVersion: string) {
  const ref = tracks(uid).doc(id);
  await db().runTransaction(async tx => {
    const current = await tx.get(ref);
    // Retrying a completed deletion is safe, including a lost HTTP response.
    if (!current.exists) return;
    if (current.get('versionId') !== expectedVersion) throw new HttpError(409, 'VERSION_CONFLICT', 'This sound changed. Refresh the library before deleting it.');
    queueRetiredAudio(tx, uid, id, current.get('objectPath'));
    tx.delete(ref);
  });
  await cleanupRetiredAudioForTrack(uid, id);
  const pending = await db().collection('users').doc(uid).collection('saves')
    .where('status', '==', 'retired').where('trackId', '==', id).limit(1).get();
  if (!pending.empty) throw new HttpError(503, 'CLEANUP_PENDING', 'Sample removed. Audio cleanup is pending. Retry to finish freeing space.');
}

async function deleteRetiredAudio(ref: DocumentReference) {
  try {
    const job = (await ref.get()).data();
    if (job?.status !== 'retired') return;
    const current = await tracks(job.userId).doc(job.trackId).get();
    if (current.get('objectPath') === job.objectPath) return; // Never delete live audio.
    await bucket().file(job.objectPath).delete({ ignoreNotFound: true });
    await ref.delete();
  } catch (error) {
    logger.warn('audio_cleanup_deferred', { errorType: error instanceof Error ? error.name : 'unknown' });
  }
}

async function cleanupRetiredAudioForTrack(uid: string, id: string) {
  try {
    const jobs = await db().collection('users').doc(uid).collection('saves')
      .where('status', '==', 'retired').where('trackId', '==', id).limit(50).get();
    for (const job of jobs.docs) await deleteRetiredAudio(job.ref);
  } catch { logger.warn('audio_cleanup_deferred', { stage: 'query' }); }
}

export async function cleanupRetiredAudio() {
  const jobs = await db().collectionGroup('saves').where('status', '==', 'retired').limit(50).get();
  for (const job of jobs.docs) await deleteRetiredAudio(job.ref);
}

// One bounded page of legacy history, using indexed documents and exact paths.
// The migration calls this repeatedly; no bucket listing or audio scanning.
export async function purgeTrackHistory(uid: string, id: string) {
  const ref = tracks(uid).doc(id);
  const history = await ref.collection('versions').orderBy(FieldPath.documentId()).limit(50).get();
  if (history.empty) return 0;
  await db().runTransaction(async tx => {
    const current = await tx.get(ref);
    if (!current.exists) throw new HttpError(404, 'NOT_FOUND', 'Track not found.');
    for (const version of history.docs) {
      const path = version.get('objectPath');
      if (path && path !== current.get('objectPath')) queueRetiredAudio(tx, uid, id, path);
      tx.delete(version.ref);
    }
  });
  await cleanupRetiredAudioForTrack(uid, id);
  return history.size;
}

export async function cleanupIncompleteSaves() {
  await cleanupRetiredAudio();
  const expired = await db().collectionGroup('saves').where('status', '==', 'pending')
    .where('expiresAt', '<=', new Date().toISOString()).orderBy('expiresAt').limit(50).get();
  const cleaning = await db().collectionGroup('saves').where('status', '==', 'cleaning').limit(50).get();
  for (const doc of [...expired.docs, ...cleaning.docs]) {
    const path = await db().runTransaction(async tx => {
      const current = await tx.get(doc.ref);
      if (!['pending', 'cleaning'].includes(current.get('status'))) return undefined;
      if (current.get('status') === 'pending' && current.get('expiresAt') > new Date().toISOString()) return undefined;
      tx.update(doc.ref, { status: 'cleaning' });
      return current.get('objectPath') as string | null;
    });
    if (path === undefined) continue;
    if (path) await bucket().file(path).delete({ ignoreNotFound: true });
    await db().runTransaction(async tx => {
      const current = await tx.get(doc.ref);
      if (current.get('status') === 'cleaning') tx.update(doc.ref, { status: 'failed' });
    });
  }
}
