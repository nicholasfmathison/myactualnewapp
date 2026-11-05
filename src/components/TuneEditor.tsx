import { useEffect, useRef, useState } from 'react';
import { api, errorMessage, type Track } from '../lib/api';
import { trimToWav } from '../lib/audio-trim';
import { tunedFrameCount, type Tuning } from '../lib/pitch';
import { Modal, Notice } from './LibraryUI';

export function TuneEditor({ track, close, saved }: { track: Track; close: () => void; saved: () => void }) {
  const [tuning, setTuning] = useState<Tuning | null>(); const [error, setError] = useState('');
  const [ready, setReady] = useState(false); const [playing, setPlaying] = useState(false); const [saving, setSaving] = useState(false);
  const context = useRef<AudioContext | undefined>(undefined); const source = useRef<AudioBufferSourceNode | undefined>(undefined); const rendered = useRef<AudioBuffer | undefined>(undefined);
  const wavData = useRef<ArrayBuffer | undefined>(undefined);
  const currentTrack = useRef(track); const key = useRef(crypto.randomUUID()); const generation = useRef(0);
  const alive = useRef(true); const savingLock = useRef(false);
  function stop() { generation.current++; if (source.current) { source.current.onended = null; source.current.stop(); source.current.disconnect(); source.current = undefined; } setPlaying(false); }
  useEffect(() => {
    let cancelled = false; alive.current = true;
    const controller = new AbortController(); let worker: Worker | undefined; let ctx: AudioContext | undefined;
    async function load() {
      try {
        const fresh = await api<Track>(`/tracks/${track.id}`, { signal: controller.signal });
        currentTrack.current = fresh;
        const response = await fetch(fresh.audioUrl, { signal: controller.signal });
        if (!response.ok) throw new Error('Could not load this sound. Close and try again.');
        const blob = await response.blob();
        if (!blob.size || blob.size > 10_000_000) throw new Error('Choose audio of 10 MB or less.');
        if (cancelled) return;
        ctx = new AudioContext(fresh.audio.sampleRate ? { sampleRate: fresh.audio.sampleRate } : undefined); context.current = ctx;
        const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
        if (cancelled) return;
        if (audio.numberOfChannels > 2) throw new Error('Tuning supports mono and stereo sounds.');
        worker = new Worker(new URL('../lib/pitch-worker.ts', import.meta.url), { type: 'module' });
        worker.onerror = () => { if (!cancelled) setError('Could not analyze this sound. Close and try again.'); worker?.terminate(); };
        worker.onmessage = async (event: MessageEvent<{ tuning: Tuning | null; error?: string }>) => {
          worker?.terminate(); if (cancelled) return;
          try {
            if (event.data.error) throw new Error(event.data.error);
            const detected = event.data.tuning; setTuning(detected);
            if (!detected || Math.abs(detected.cents) < 3) return;
            const frames = tunedFrameCount(audio, detected.ratio);
            const offline = new OfflineAudioContext(audio.numberOfChannels, frames, audio.sampleRate);
            const node = offline.createBufferSource(); node.buffer = audio; node.playbackRate.value = detected.ratio; node.connect(offline.destination); node.start();
            const result = await offline.startRendering(); node.disconnect();
            if (cancelled) return;
            // Preview the exact PCM16 samples that will be saved, including quantization.
            const wav = trimToWav(result, 0, result.duration);
            wavData.current = wav;
            rendered.current = await ctx!.decodeAudioData(wav.slice(0));
            if (!cancelled) setReady(true);
          } catch (err) { if (!cancelled) setError(errorMessage(err)); }
        };
        const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c).slice());
        worker.postMessage({ sampleRate: audio.sampleRate, channels }, channels.map(c => c.buffer));
      } catch (err) { if (!cancelled) setError(errorMessage(err)); }
    }
    void load();
    return () => { cancelled = true; alive.current = false; generation.current++; controller.abort(); worker?.terminate(); if (source.current) { source.current.onended = null; source.current.stop(); source.current = undefined; } if (ctx) void ctx.close(); };
  }, [track.id]);
  async function preview() {
    if (playing) { stop(); return; }
    if (!ready || !rendered.current || savingLock.current) return;
    const attempt = ++generation.current; setPlaying(true); setError('');
    try {
      const ctx = context.current!; await ctx.resume(); if (attempt !== generation.current) return;
      const node = ctx.createBufferSource(); node.buffer = rendered.current; node.connect(ctx.destination); source.current = node;
      node.onended = () => { node.disconnect(); if (source.current === node) { source.current = undefined; setPlaying(false); } }; node.start();
    } catch { if (alive.current && attempt === generation.current) { setPlaying(false); setError('Playback could not start. Try again.'); } }
  }
  async function save() {
    if (!ready || !rendered.current || savingLock.current) return;
    savingLock.current = true; setSaving(true); setError(''); stop();
    try {
      const current = currentTrack.current;
      const file = new File([wavData.current!], `${current.audio.filename.replace(/\.[^.]+$/, '').replace(/-C$/, '')}-C.wav`, { type: 'audio/wav' });
      const body = new FormData(); body.set('title', current.title); body.set('file', file);
      await api(`/tracks/${current.id}`, { method: 'PUT', body, headers: { 'Idempotency-Key': key.current, 'If-Match': current.versionId } }); saved();
    } catch (err) { if (alive.current) setError(errorMessage(err)); }
    finally { savingLock.current = false; if (alive.current) setSaving(false); }
  }
  const alreadyC = tuning && Math.abs(tuning.cents) < 3;
  return <Modal title="Tune to C" subtitle="" neutral close={() => { if (!savingLock.current) close(); }}>
    <p className="truncate text-sm text-neutral-500">{track.title}</p>
    {tuning === undefined && !error && <p role="status" className="py-7 text-sm text-neutral-500">Finding the pitch…</p>}
    {tuning === null && <p role="status" className="py-7 text-sm text-neutral-500">No clear, stable pitch found.</p>}
    {tuning && <div className="py-6"><p className="text-3xl font-medium tracking-tight">{alreadyC ? `Already in ${tuning.targetNote}` : `${tuning.note} → ${tuning.targetNote}`}</p>{!alreadyC && <p className="mt-2 text-xs text-neutral-400">{ready ? `${currentTrack.current.audio.duration.toFixed(2)}s → ${rendered.current!.duration.toFixed(2)}s · Replaces audio when saved` : !error ? 'Preparing preview…' : ''}</p>}</div>}
    {error && <Notice>{error}</Notice>}
    {tuning && !alreadyC && <div className="mt-3 flex items-center justify-between gap-3"><button type="button" className="rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100" disabled={!ready || saving} onClick={() => void preview()}>{playing ? 'Stop' : 'Preview'}</button><button type="button" className="rounded-lg bg-neutral-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700" disabled={!ready || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button></div>}
  </Modal>;
}
