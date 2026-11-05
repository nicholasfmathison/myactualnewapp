import { randomUUID } from 'node:crypto';
import { getFirestore, FieldPath, type Query } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
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
  const { objectPath: _path, folder: _folder, normalizedTitle: _normalized, ...data } = track;
  return { ...data, audioUrl: url, audioUrlExpiresAt: expiresAt };
}
export async function page(uid: string, cursor: unknown, title?: string, trackId?: string) {
  const scope = JSON.stringify([uid, trackId ?? '', title ?? '']);
  let query: Query = trackId ? tracks(uid).doc(trackId).collection('versions') : tracks(uid);
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
  details: Pick<Track, 'title' | 'normalizedTitle' | 'description'>;
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
      if (op.status === 'complete') return { result: op.result as { track: Track; unchanged: boolean } };
      if (op.status !== 'failed') throw new HttpError(409, 'SAVE_IN_PROGRESS', 'This save is still processing. Retry the same request shortly.');
    }
    const current = await tx.get(ref);
    const previous = current.data() as Track | undefined;
    if (input.id && !previous) throw new HttpError(404, 'NOT_FOUND', 'Track not found.');
    if (previous && previous.versionId !== expectedVersion) throw new HttpError(409, 'VERSION_CONFLICT', 'This track changed. Reload it before saving.');
    if (!previous && !file) throw new HttpError(400, 'FILE_REQUIRED', 'Choose an audio file.');
    const sameAudio = !file || (file.audio.sha256 === previous?.audio.sha256 && file.audio.filename === previous.audio.filename);
    if (previous && sameAudio && details.title === previous.title && details.description === previous.description) {
      const result = { track: previous, unchanged: true };
      tx.set(operation, { status: 'complete', requestHash, result });
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
  const { track, upload } = reservation;
  try {
    if (upload) await bucket().file(track.objectPath).save(file!.buffer, { resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: track.audio.contentType, cacheControl: 'private, max-age=0',
        ...(process.env.FIREBASE_STORAGE_EMULATOR_HOST ? { metadata: { firebaseStorageDownloadTokens: randomUUID() } } : {}) } });
    return await db().runTransaction(async tx => {
      const [op, current] = await Promise.all([tx.get(operation), tx.get(ref)]);
      if (op.get('lease') !== lease || op.get('status') !== 'pending') throw new HttpError(409, 'SAVE_EXPIRED', 'This save expired. Try again.');
      if (current.exists && current.get('versionId') !== expectedVersion) throw new HttpError(409, 'VERSION_CONFLICT', 'This track changed. Reload it before saving.');
      const result = { track, unchanged: false };
      tx.create(ref.collection('versions').doc(track.versionId), track);
      tx.set(ref, track);
      tx.set(operation, { status: 'complete', requestHash, result });
      return result;
    });
  } catch (error) {
    // A transaction response can be lost after commit. Never delete committed audio.
    const current = await operation.get();
    if (current.get('status') === 'complete') return current.get('result');
    // Leave the exact object reference for bounded cleanup; no bucket enumeration.
    await db().runTransaction(async tx => {
      const op = await tx.get(operation);
      if (op.get('lease') === lease && op.get('status') === 'pending') tx.update(operation, { expiresAt: new Date().toISOString() });
    });
    throw error;
  }
}

export async function cleanupIncompleteSaves() {
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
