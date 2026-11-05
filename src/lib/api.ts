import { auth } from './firebase';
export interface AudioInfo { filename: string; format: 'wav' | 'mp3'; bytes: number; duration: number; sampleRate: number | null; channels: number | null }
export interface Track { id: string; userId: string; title: string; description: string; versionId: string; createdAt: string; savedAt: string; audio: AudioInfo; audioUrl: string; audioUrlExpiresAt: string }
export interface Page { items: Track[]; nextCursor: string | null }
export interface Profile { id: string; username: string; email: string }
export class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const user = auth?.currentUser;
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in.');
  const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '')}/v1${path}`, { ...init, headers });
  if (response.status === 401 && retry) { await user.getIdToken(true); return api<T>(path, init, false); }
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) throw new ApiError(response.status, body.error?.code ?? 'REQUEST_FAILED', body.error?.message ?? 'The request failed.');
  return body as T;
}
export const duration = (seconds: number) => {
  const ms = Math.round(seconds * 1000);
  return ms < 60000 ? `${(ms / 1000).toFixed(3)}s` : `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(3).padStart(6, '0')}`;
};
export const fileSize = (bytes: number) => bytes < 1_000_000 ? `${(bytes / 1000).toFixed(1)} KB` : `${(bytes / 1e6).toFixed(2)} MB`;
export const date = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
export function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(code)) return 'Check your email and password, then try again.';
    if (/too-many-requests/.test(code)) return 'Too many attempts. Please wait a moment and try again.';
    if (/network-request-failed/.test(code)) return 'Could not connect. Check your internet connection.';
    if (/user-token-expired|user-disabled/.test(code)) return 'Your session ended. Please sign in again.';
  }
  return error instanceof TypeError ? 'Could not connect. Check your connection and try again.' : 'Something went wrong. Please try again.';
}
