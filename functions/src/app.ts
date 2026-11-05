import express, { type Request, type Response, type NextFunction } from 'express';
import Busboy from 'busboy';
import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions';
import { HttpError, inspectAudio, MAX_BYTES, normalizeTitle, requireUuid, validateDetails } from './domain.js';
import { db, getTrack, page, present, save } from './store.js';

export const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim());
  if (origin && !allowed.includes(origin)) return res.status(403).json({ error: { code: 'ORIGIN', message: 'Origin not allowed.' } });
  if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.vary('Origin'); }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key, If-Match');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.get('/v1/health', (_req, res) => res.json({ status: 'ok', commit: process.env.DEPLOY_COMMIT ?? 'local', environment: process.env.APP_ENV ?? 'local' }));
app.use('/v1', async (req, res, next) => {
  try {
    const match = req.headers.authorization?.match(/^Bearer (\S+)$/);
    if (!match) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in.');
    let token;
    try { token = await getAuth().verifyIdToken(match[1], true); }
    catch { throw new HttpError(401, 'UNAUTHENTICATED', 'Your session expired. Please sign in again.'); }
    const profile = (await db().collection('users').doc(token.uid).get()).data();
    if (!profile?.enabled) throw new HttpError(403, 'NOT_APPROVED', 'This account has not been granted library access.');
    res.locals.user = { id: token.uid, username: profile.username, email: token.email ?? null };
    next();
  } catch (error) { next(error); }
});
app.get('/v1/auth/me', (_req, res) => res.json(res.locals.user));
app.post('/v1/auth/logout', async (_req, res) => {
  await getAuth().revokeRefreshTokens(res.locals.user.id);
  res.sendStatus(204);
});
app.get('/v1/tracks/latest', async (req, res) => res.json(await page(res.locals.user.id, req.query.cursor)));
app.get('/v1/tracks', async (req, res) => {
  if (typeof req.query.title !== 'string' || !req.query.title.trim() || req.query.title.length > 160) throw new HttpError(400, 'INVALID_TITLE', 'Enter the exact track title.');
  res.json(await page(res.locals.user.id, req.query.cursor, normalizeTitle(req.query.title)));
});
app.get('/v1/tracks/:id', async (req, res) => res.json(await present(await getTrack(res.locals.user.id, requireUuid(req.params.id)))));

async function multipart(req: Request): Promise<{ fields: Record<string, string>; file?: { buffer: Buffer; filename: string } }> {
  if (!req.is('multipart/form-data')) throw new HttpError(415, 'MULTIPART_REQUIRED', 'Submit audio and details as multipart form data.');
  if (Number(req.headers['content-length'] ?? 0) > MAX_BYTES + 100_000) throw new HttpError(413, 'FILE_SIZE', 'File exceeds 10 MB.');
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    let file: { buffer: Buffer; filename: string } | undefined;
    let error: Error | undefined;
    const parser = Busboy({ headers: req.headers, limits: { fileSize: MAX_BYTES + 1, files: 1, fields: 1, parts: 3, fieldSize: 25_000 } });
    parser.on('field', (name, value, info) => {
      if (!['title'].includes(name) || name in fields || info.valueTruncated) error = new HttpError(400, 'INVALID_FIELDS', 'Supply the title once.');
      fields[name] = value;
    });
    parser.on('file', (name, stream, info) => {
      if (name !== 'file') error = new HttpError(400, 'INVALID_FILE_FIELD', 'Use the file field for your audio.');
      const chunks: Buffer[] = [];
      stream.on('limit', () => { error = new HttpError(413, 'FILE_SIZE', 'File exceeds 10 MB.'); });
      stream.on('data', data => chunks.push(data));
      stream.on('end', () => { file = { buffer: Buffer.concat(chunks), filename: info.filename ?? 'audio' }; });
      stream.on('error', reject);
    });
    for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit']) parser.on(event, () => { error = new HttpError(400, 'INVALID_PARTS', 'Supply one audio file and title.'); });
    parser.on('error', () => reject(new HttpError(400, 'INVALID_MULTIPART', 'The upload request is incomplete.')));
    parser.on('close', () => error ? reject(error) : resolve({ fields, file }));
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (rawBody) parser.end(rawBody); else req.pipe(parser);
  });
}
async function saveRoute(req: Request, res: Response) {
  const key = requireUuid(req.get('Idempotency-Key'));
  const id = req.method === 'PUT' ? requireUuid(req.params.id) : undefined;
  const expectedVersion = id ? requireUuid(req.get('If-Match')?.replace(/^"|"$/g, '')) : undefined;
  const { fields, file } = await multipart(req);
  const details = validateDetails(fields);
  const inspected = file ? { buffer: file.buffer, audio: await inspectAudio(file.buffer, file.filename) } : undefined;
  const result = await save({ uid: res.locals.user.id, username: res.locals.user.username, key, id, expectedVersion, details, file: inspected });
  res.status(id ? 200 : 201).json({ ...(await present(await getTrack(res.locals.user.id, result.track.id))), unchanged: result.unchanged });
}
app.post('/v1/tracks', saveRoute);
app.put('/v1/tracks/:id', saveRoute);
app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Route not found.')));
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const known = error instanceof HttpError;
  if (!known) logger.error('api_failure', { method: req.method, route: req.route?.path ?? 'unknown', errorType: error instanceof Error ? error.name : 'unknown' });
  res.status(known ? error.status : 500).json({ error: { code: known ? error.code : 'INTERNAL', message: known ? error.message : 'The request could not be completed. Please retry.' } });
});
