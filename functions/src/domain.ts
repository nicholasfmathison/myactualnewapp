import { createHash } from 'node:crypto';
import { parseBuffer } from 'music-metadata';
import { fileTypeFromBuffer } from 'file-type';

export const MAX_BYTES = 10_000_000;
export const PAGE_SIZE = 24;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function requireUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new HttpError(400, 'INVALID_ID', 'A valid UUID is required.');
  return value;
}
export const normalizeTitle = (title: string) => title.normalize('NFKC').trim().toLowerCase();
export const slug = (title: string) => normalizeTitle(title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'sound';
export function validateDetails(fields: Record<string, string>) {
  const title = fields.title?.trim();
  if (!title || title.length > 160) throw new HttpError(400, 'INVALID_TITLE', 'Use a title between 1 and 160 characters.');
  return { title, normalizedTitle: normalizeTitle(title) };
}
export interface AudioInfo {
  filename: string; format: 'wav' | 'mp3'; contentType: string; bytes: number;
  duration: number; sampleRate: number | null; channels: number | null; sha256: string;
}
export async function inspectAudio(buffer: Buffer, filename: string): Promise<AudioInfo> {
  if (!buffer.length || buffer.length > MAX_BYTES) throw new HttpError(413, 'FILE_SIZE', 'Choose a nonempty WAV or MP3 file no larger than 10 MB.');
  const detected = await fileTypeFromBuffer(buffer).catch(() => undefined);
  if (!detected || !['wav', 'mp3'].includes(detected.ext)) throw new HttpError(415, 'FILE_TYPE', 'Only valid WAV and MP3 audio is supported.');
  try {
    const { format } = await parseBuffer(buffer, { mimeType: detected.mime, size: buffer.length }, { duration: true });
    if (!format.duration || !Number.isFinite(format.duration) || format.duration <= 0 || !format.codec) throw new Error('No audio');
    return { filename: filename.replace(/.*[/\\]/, '').slice(0, 255), format: detected.ext as 'wav' | 'mp3',
      contentType: detected.ext === 'wav' ? 'audio/wav' : 'audio/mpeg', bytes: buffer.length,
      duration: format.duration, sampleRate: format.sampleRate ?? null, channels: format.numberOfChannels ?? null,
      sha256: createHash('sha256').update(buffer).digest('hex') };
  } catch { throw new HttpError(415, 'INVALID_AUDIO', 'The audio could not be read. Export a valid WAV or MP3 and try again.'); }
}
export interface Track {
  id: string; userId: string; title: string; normalizedTitle: string;
  folder: string; versionId: string; createdAt: string; savedAt: string; audio: AudioInfo; objectPath: string;
}
export function fingerprint(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function encodeCursor(scope: string, track: { savedAt: string; id: string }) {
  return Buffer.from(JSON.stringify({ scope, at: track.savedAt, id: track.id })).toString('base64url');
}
export function decodeCursor(value: unknown, scope: string): { at: string; id: string } | undefined {
  if (value === undefined) return;
  try {
    if (typeof value !== 'string' || value.length > 2048) throw new Error();
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (cursor.scope !== scope || !UUID.test(cursor.id) || new Date(cursor.at).toISOString() !== cursor.at) throw new Error();
    return cursor;
  } catch { throw new HttpError(400, 'INVALID_CURSOR', 'This page cursor is invalid. Refresh the library.'); }
}
