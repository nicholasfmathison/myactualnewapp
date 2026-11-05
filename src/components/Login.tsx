import { useState, type FormEvent } from 'react';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { auth, configured } from '../lib/firebase';
import { errorMessage } from '../lib/api';
import { Brand, Notice, Symbol } from './LibraryUI';
export function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await signInWithEmailAndPassword(auth!, email, password); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function reset() {
    if (!email.trim()) { setError('Enter your email above first.'); return; }
    setBusy(true); setError(''); setMessage('');
    try { await sendPasswordResetEmail(auth!, email); setMessage('If this email has an account, a password reset link is on its way.'); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-[#f5f5ef] p-6 sm:p-12"><Brand /><div className="mx-auto grid max-w-5xl gap-12 py-16 md:grid-cols-2 md:py-28">
    <div><span className="pill"><Symbol name="lock" className="!h-3 !w-3" />A space for your sounds</span><h1 className="mt-7 text-5xl font-semibold leading-[1.08] tracking-[-.05em] sm:text-6xl">Good sounds.<br /><span className="font-serif italic font-normal text-[#6d825c]">Kept close.</span></h1><p className="mt-6 max-w-sm leading-relaxed text-stone-500">Your recordings, ideas, and little discoveries. One simple, private library.</p><div className="mt-12 flex h-20 items-center gap-[5px] text-[#b1c89b]" aria-hidden="true">{Array.from({ length: 37 }, (_, i) => <span key={i} className="w-[5px] rounded-full bg-current" style={{ height: `${12 + Math.abs(Math.sin(i * 1.9) * Math.cos(i * .2)) * 67}px` }} />)}</div><p className="mt-5 text-xs text-stone-400">WAV & MP3 · Private by default</p></div>
    <section className="self-center rounded-3xl border border-stone-200 bg-white p-7 shadow-[0_10px_60px_-40px_#647154] sm:p-10">{configured ? <><p className="eyebrow">WELCOME BACK</p><h2 className="mt-3 text-2xl font-semibold">Step into your library.</h2><p className="mt-2 text-sm text-stone-500">Sign in with your personal account.</p><form onSubmit={submit} className="mt-7 space-y-5"><label className="field-label">Email<input className="field" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label><label className="field-label">Password<input className="field" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>{error && <Notice>{error}</Notice>}{message && <p role="status" className="text-sm text-emerald-700">{message}</p>}<button className="primary w-full justify-between" disabled={busy}>{busy ? 'Connecting…' : 'Sign in'}<Symbol name="arrow" /></button></form><button onClick={reset} disabled={busy} className="mt-5 text-sm text-stone-500 underline underline-offset-4">Forgot your password?</button></> : <><span className="pill">SETUP IN PROGRESS</span><h2 className="mt-5 text-2xl font-semibold">Your soundroom is almost ready.</h2><p className="mt-4 text-sm leading-relaxed text-stone-500">The library needs its Firebase connection before you can sign in or save audio. No files have been uploaded.</p><p className="mt-5 text-xs leading-relaxed text-stone-400">Connect this environment using the Firebase setup instructions in the repository.</p></>}</section>
    </div><footer className="mx-auto max-w-5xl border-t border-stone-200 pt-6 text-xs text-stone-400">A little more room for what you make.</footer></main>;
}
