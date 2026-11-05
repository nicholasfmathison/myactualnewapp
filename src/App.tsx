import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from './lib/firebase';
import { api, date, duration, fileSize, errorMessage, type Page, type Profile, type Track } from './lib/api';
import { Brand, Notice, Symbol } from './components/LibraryUI';
import { FontPicker } from './components/FontPicker';
import { DeleteDialog } from './components/DeleteDialog';
import { TuneEditor } from './components/TuneEditor';
import { Login } from './components/Login';
import { Player, SaveDialog, TrackTitle } from './components/AudioDialogs';

function Library({ profile, logout }: { profile: Profile; logout: () => void }) {
  const [items, setItems] = useState<Track[]>([]); const [cursor, setCursor] = useState<string | null>(null); const [busy, setBusy] = useState(true); const [error, setError] = useState('');
  const [query, setQuery] = useState(''); const [search, setSearch] = useState(''); const [edit, setEdit] = useState<Track | 'new'>();
  const [tune, setTune] = useState<Track>();
  const [deleting, setDeleting] = useState<Track>();
  const requestSequence = useRef(0);
  const load = useCallback(async (next?: string) => {
    const request = ++requestSequence.current; setBusy(true); setError(''); if (!next) { setItems([]); setCursor(null); }
    try {
      const params = new URLSearchParams(); if (search) params.set('title', search); if (next) params.set('cursor', next);
      const result = await api<Page>(`/tracks${search ? '' : '/latest'}?${params}`);
      if (request !== requestSequence.current) return;
      setItems(prev => next ? [...prev, ...result.items.filter(item => !prev.some(p => p.id === item.id))] : result.items); setCursor(result.nextCursor);
    } catch (err) { if (request === requestSequence.current) setError(errorMessage(err)); }
    finally { if (request === requestSequence.current) setBusy(false); }
  }, [search]);
  useEffect(() => { void load(); return () => { requestSequence.current++; }; }, [load]);
  return <div className="min-h-screen bg-[#f5f5f5] text-[#262626]">
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-neutral-200 bg-[#ededed] p-7 lg:flex"><Brand /><p className="eyebrow mb-3 mt-8">WORKSPACE</p><button onClick={() => { setSearch(''); setQuery(''); if (!search) void load(); }} className="flex items-center gap-3 rounded-xl bg-[#dcdcdc] px-4 py-3 text-sm font-medium"><Symbol name="library" />Your library</button><div className="mt-auto border-t border-neutral-200 pt-5"><p className="truncate text-sm font-medium">{profile.username}</p><button onClick={logout} className="mt-4 flex items-center gap-2 text-xs text-neutral-500"><Symbol name="logout" className="!h-4 !w-4" />Sign out</button></div></aside>
    <div className="lg:ml-60"><header className="flex items-center justify-between gap-4 border-b border-neutral-200 px-6 py-4 sm:px-10 lg:hidden"><div className="lg:hidden"><Brand /></div><div className="flex items-center gap-3"><span className="pill"><Symbol name="lock" className="!h-3 !w-3" />Private</span><button className="icon-button lg:hidden" onClick={logout} aria-label="Sign out"><Symbol name="logout" /></button></div></header>
    <main className="mx-auto max-w-[1440px] px-6 py-7 sm:px-10"><div className="flex flex-wrap items-end justify-between gap-5"><div className="flex flex-wrap items-center gap-4"><h1 className="text-4xl font-semibold tracking-[-.045em] sm:text-5xl">Your sound library<span className="text-[#888888]">.</span></h1><span className="pill hidden lg:inline-flex"><Symbol name="lock" className="!h-3 !w-3" />Private</span></div><div className="flex items-center gap-2"><FontPicker /><button className="primary record-button" onClick={() => { setEdit('new'); }}><Symbol name="mic" />Record</button></div></div>
    <div className="my-6 flex flex-wrap items-center justify-between gap-4 border-y border-neutral-200 py-4"><div className="flex items-center gap-3"><span className="text-sm font-medium">{search ? 'Search results' : 'Latest'}</span><span className="rounded-md bg-[#e5e5e5] px-2 py-1 text-[10px] font-medium text-[#525252]">{items.length} loaded</span></div><form onSubmit={e => { e.preventDefault(); if (search === query.trim()) void load(); else setSearch(query.trim()); }} className="flex w-full items-center gap-2 sm:w-auto"><div className="relative flex-1"><Symbol name="search" className="absolute left-3 top-3 !h-4 !w-4 text-neutral-400" /><input aria-label="Search by exact title" className="field !mt-0 !py-2.5 !pl-9 sm:w-64" placeholder="Search by exact title…" value={query} maxLength={160} onChange={e => setQuery(e.target.value)} /></div><button className="secondary !px-3" type="submit">Find</button>{search && <button type="button" className="icon-button" aria-label="Clear search" onClick={() => { setQuery(''); setSearch(''); }}><Symbol name="close" /></button>}</form></div>
    {error && <div className="mb-6 space-y-3"><Notice>{error}</Notice><button className="secondary" onClick={() => void load()}>Retry</button></div>}
    {!busy && !error && items.length === 0 && <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/50 px-6 py-20 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#e5e5e5]"><Symbol name={search ? 'search' : 'upload'} className="!h-7 !w-7 text-[#737373]" /></div><h2 className="mt-6 text-xl font-semibold">{search ? 'No sounds with that title.' : 'Record your first sound.'}</h2><p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-neutral-500">{search ? 'Search matches the full title, ignoring capitalization. Try another title or clear your search.' : 'Capture a sound, listen back, and save it here.'}</p>{!search && <button className="primary record-button mx-auto mt-6" onClick={() => { setEdit('new'); }}><Symbol name="mic" />Record</button>}</div>}
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{items.map(track => <article key={track.id} className="rounded-2xl border border-neutral-200 bg-white p-5 transition-shadow hover:shadow-[0_8px_30px_-20px_#737373]"><div className="mb-3 flex items-center justify-between"><span className={`rounded-md px-2 py-1 text-[10px] font-semibold tracking-wider ${track.audio.format === 'wav' ? 'bg-[#e5e5e5] text-[#525252]' : 'bg-[#eeeeee] text-[#666666]'}`}>{track.audio.format.toUpperCase()}</span><div className="-mr-2 flex items-center gap-2"><span className="font-mono text-xs text-neutral-400">{duration(track.audio.duration)}</span><button type="button" className="icon-button !h-8 !w-8 hover:!text-neutral-700" title="Delete sound" aria-label={`Delete ${track.title}`} onClick={() => setDeleting(track)}><Symbol name="close" className="!h-4 !w-4" /></button></div></div><TrackTitle track={track} saved={() => { void load(); }} /><p className="mb-3 mt-2 text-[11px] text-neutral-400">{fileSize(track.audio.bytes)} · {track.audio.sampleRate ? `${track.audio.sampleRate / 1000} kHz` : 'Unknown sample rate'} · {track.audio.channels === 1 ? 'Mono' : track.audio.channels === 2 ? 'Stereo' : `${track.audio.channels ?? '?'} channels`}</p><Player key={track.versionId} track={track} /><div className="mt-3 flex items-center justify-between gap-2 border-t border-neutral-100 pt-2"><span className="text-[10px] text-neutral-400">Saved {date(track.savedAt)}</span><div className="flex items-center gap-1"><button className="rounded-lg px-2 py-2 text-xs text-neutral-500 hover:bg-neutral-100" onClick={() => setTune(track)} aria-label={`Tune ${track.title} to C`}>Tune to C</button><button className="icon-button" onClick={() => { setEdit(track); }} aria-label={`Trim ${track.title}`} title="Trim audio"><Symbol name="trim" className="!h-4 !w-4" /></button></div></div></article>)}</div>
    {busy && <p role="status" className="py-12 text-center text-sm text-neutral-500">Loading your sounds…</p>}{cursor && !busy && <div className="mt-10 text-center"><button className="secondary mx-auto" onClick={() => void load(cursor)}>Load more sounds<Symbol name="plus" className="!h-4 !w-4" /></button><p className="mt-3 text-xs text-neutral-400">24 at a time. Newest saves first.</p></div>}
    <footer className="mt-14 flex flex-wrap justify-between gap-3 border-t border-neutral-200 pt-5 text-[11px] text-neutral-400"><span>Your sounds, kept close.</span><span>WAV & MP3</span></footer></main></div>
    {deleting && <DeleteDialog track={deleting} close={() => setDeleting(undefined)} deleted={() => { setDeleting(undefined); void load(); }} />}
    {tune && <TuneEditor track={tune} close={() => setTune(undefined)} saved={() => { setTune(undefined); void load(); }} />}
    {edit && <SaveDialog track={edit === 'new' ? undefined : edit} close={() => setEdit(undefined)} saved={() => { setEdit(undefined); void load(); }} />}</div>;
}
export default function App() {
  const [user, setUser] = useState<User | null>(null); const [ready, setReady] = useState(!auth); const [profile, setProfile] = useState<Profile>(); const [error, setError] = useState('');
  useEffect(() => auth ? onAuthStateChanged(auth, next => { setUser(next); setProfile(undefined); setError(''); setReady(true); }) : undefined, []);
  useEffect(() => { let active = true; if (user) api<Profile>('/auth/me').then(value => { if (active) setProfile(value); }).catch(err => { if (active) setError(errorMessage(err)); }); return () => { active = false; }; }, [user]);
  async function logout() { try { await api('/auth/logout', { method: 'POST' }); } finally { await signOut(auth!); } }
  if (!ready) return <div className="p-12 text-neutral-500" role="status">Opening Soundroom…</div>;
  if (!user) return <Login />;
  if (!profile) return <main className="mx-auto max-w-lg space-y-6 p-10"><Brand />{error ? <><Notice>{error}</Notice><button className="secondary" onClick={() => void signOut(auth!)}>Back to sign in</button></> : <p role="status">Opening your library…</p>}</main>;
  return <Library profile={profile} logout={() => { void logout().catch(() => {}); }} />;
}
