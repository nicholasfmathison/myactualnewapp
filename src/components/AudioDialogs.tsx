import { useRef, useState, type FormEvent } from 'react';
import { api, errorMessage, type Track } from '../lib/api';
import { TrimEditor } from './TrimEditor';
import { Modal, Notice, Symbol } from './LibraryUI';

export function SaveDialog({ track, close, saved }: { track?: Track; close: () => void; saved: () => void }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File>(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [trimming, setTrimming] = useState(false);
  const key = useRef(crypto.randomUUID()); const cropHash = useRef('');
  const changed = () => { key.current = crypto.randomUUID(); setError(''); };
  async function replaceAudio(trimmed: File) {
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await trimmed.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('');
    if (cropHash.current !== hash) { key.current = crypto.randomUUID(); cropHash.current = hash; }
    const body = new FormData(); body.set('title', track!.title); body.set('file', trimmed);
    await api(`/tracks/${track!.id}`, { method: 'PUT', body, headers: { 'Idempotency-Key': key.current, 'If-Match': track!.versionId } }); saved();
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!file || !file.size || file.size > 10_000_000) { setError('Choose a nonempty WAV or MP3 of 10 MB or less.'); return; }
    setBusy(true); const body = new FormData(); body.set('title', title); body.set('file', file);
    try { await api('/tracks', { method: 'POST', body, headers: { 'Idempotency-Key': key.current } }); saved(); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  if (track) return <TrimEditor track={track} close={close} apply={replaceAudio} />;
  if (trimming && file) return <TrimEditor file={file} close={() => setTrimming(false)} apply={trimmed => { setFile(trimmed); changed(); setTrimming(false); }} />;
  return <Modal title="Add a sound" subtitle="" close={() => { if (!busy) close(); }}><form className="space-y-5" onSubmit={submit}>
    <fieldset disabled={busy} className="space-y-5">
      <label className="upload-zone"><Symbol name="upload" /><span>{file?.name ?? 'Choose your audio file'}</span><span className="text-xs text-stone-400">WAV or MP3 · Up to 10 MB</span><input aria-label="Audio file" className="mt-3 block w-full text-xs" type="file" accept=".wav,.mp3,audio/wav,audio/mpeg" onChange={e => { setFile(e.target.files?.[0]); changed(); }} /></label>
      {file && <button type="button" className="secondary" onClick={() => setTrimming(true)}><Symbol name="trim" />Crop audio</button>}
      <label className="field-label">Title<input className="field" value={title} maxLength={160} required onChange={e => { setTitle(e.target.value); changed(); }} /></label>
    </fieldset>
    {error && <Notice>{error}</Notice>}
    <div className="flex justify-end gap-3"><button type="button" className="secondary" disabled={busy} onClick={close}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Add sound'}</button></div>
  </form></Modal>;
}

export function TrackTitle({ track, saved }: { track: Track; saved: (updated: Track) => void }) {
  const [editing, setEditing] = useState(false); const [value, setValue] = useState(track.title);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const key = useRef(crypto.randomUUID());
  async function rename(event: FormEvent) {
    event.preventDefault(); if (!value.trim()) return;
    if (value.trim() === track.title) { setEditing(false); return; }
    setBusy(true); setError(''); const body = new FormData(); body.set('title', value.trim());
    try { const updated = await api<Track>(`/tracks/${track.id}`, { method: 'PUT', body, headers: { 'Idempotency-Key': key.current, 'If-Match': track.versionId } }); saved(updated); setEditing(false); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <div>{editing ? <form onSubmit={rename} className="flex flex-wrap items-center gap-1"><input autoFocus aria-label="Sound title" className="field !mt-0 min-w-0 flex-1 !py-2" maxLength={160} required disabled={busy} value={value} onChange={e => { setValue(e.target.value); key.current = crypto.randomUUID(); }} onKeyDown={e => { if (e.key === 'Escape' && !busy) { e.preventDefault(); setEditing(false); setError(''); } }} /><button type="submit" disabled={busy} className="rounded-lg px-2 py-2 text-xs font-medium text-neutral-600">{busy ? 'Saving…' : 'Save'}</button><button type="button" disabled={busy} className="icon-button" aria-label="Cancel rename" onClick={() => { setEditing(false); setError(''); }}><Symbol name="close" /></button></form> : <div className="flex items-center gap-1"><h2 className="min-w-0 truncate text-lg font-semibold tracking-tight" title={track.title}>{track.title}</h2><button type="button" className="icon-button !h-7 !w-7" aria-label={`Rename ${track.title}`} onClick={() => { setValue(track.title); key.current = crypto.randomUUID(); setEditing(true); }}><Symbol name="edit" className="!h-3.5 !w-3.5" /></button></div>}{error && <p role="alert" className="mt-2 text-xs text-amber-800">{error}</p>}</div>;
}
export function Player({ track }: { track: Track }) {
  const [source, setSource] = useState<Track>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function prepare() { setBusy(true); setError(''); try { setSource(await api<Track>(`/tracks/${track.id}`)); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } }
  return <div className="space-y-2">{source ? <><audio className="h-10 w-full" controls autoPlay preload="none" src={source.audioUrl} onError={() => { setError('Playback link expired or audio could not load. Open a fresh link.'); setSource(undefined); }} /><a href={source.audioUrl} target="_blank" rel="noreferrer" className="text-xs text-stone-500 underline underline-offset-4">Open audio / download</a></> : <button className="secondary w-full justify-center" onClick={prepare} disabled={busy}><Symbol name="play" className="!h-4 !w-4" />{busy ? 'Opening…' : 'Listen'}</button>}{error && <p role="alert" className="text-xs text-amber-800">{error}</p>}</div>;
}
