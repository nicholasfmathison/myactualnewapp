import { useEffect, useRef, useState } from 'react';
import { api, type Track } from '../lib/api';
import { trimToWav, wavSize } from '../lib/audio-trim';
import { TrimWaveform } from './TrimWaveform';
import { Modal, Notice } from './LibraryUI';

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function TrimEditor({ track, file, close, apply }: { track?: Track; file?: File; close: () => void; apply: (file: File) => void }) {
  const [audio, setAudio] = useState<AudioBuffer>();
  const [start, setStart] = useState(0); const [end, setEnd] = useState(0);
  const [playing, setPlaying] = useState(false);
  const bounds = useRef({ start, end }); bounds.current = { start, end };
  const [playhead, setPlayhead] = useState<number>(); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const context = useRef<AudioContext | undefined>(undefined); const source = useRef<AudioBufferSourceNode | undefined>(undefined);
  const filename = useRef(file?.name ?? track?.audio.filename ?? 'sound');
  const playbackGeneration = useRef(0);
  const stop = () => { playbackGeneration.current++; if (source.current) { source.current.onended = null; source.current.stop(); source.current.disconnect(); source.current = undefined; } setPlaying(false); setPlayhead(undefined); };
  useEffect(() => {
    let cancelled = false; const controller = new AbortController();
    const ctx = new AudioContext(track?.audio.sampleRate ? { sampleRate: track.audio.sampleRate } : undefined); context.current = ctx;
    async function load() {
      try {
        let blob: Blob;
        if (file) blob = file;
        else {
          if (!track) throw new Error('Choose an audio file first.');
          const version = await api<Track>(`/tracks/${track.id}/versions/${track.versionId}`, { signal: controller.signal });
          const response = await fetch(version.audioUrl, { signal: controller.signal });
          if (!response.ok) throw new Error('Could not load the audio. Close the editor and try again.');
          blob = await response.blob();
        }
        if (!blob.size || blob.size > 10_000_000) throw new Error('Choose a nonempty WAV or MP3 of 10 MB or less.');
        const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
        if (cancelled) return;
        if (buffer.numberOfChannels > 2) throw new Error('Trimming currently supports mono and stereo files.');
        setAudio(buffer); setEnd(buffer.duration);
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : 'This audio could not be decoded.'); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; playbackGeneration.current++; controller.abort(); if (source.current) { source.current.onended = null; source.current.stop(); source.current = undefined; } void ctx.close(); };
  }, [file, track]);

  const total = audio?.duration ?? 0;
  const valid = !!audio && start >= 0 && end <= total && end > start && Math.round(end * audio.sampleRate) > Math.round(start * audio.sampleRate);
  const size = valid ? wavSize(audio!, start, end) : 0;
  const unchanged = start === 0 && end === total;
  function changeEdge(which: 'start' | 'end', time: number) {
    stop(); setError(''); const minLength = 1 / audio!.sampleRate;
    const rounded = Math.round(time * 1000) / 1000;
    if (which === 'start') { bounds.current.start = clamp(rounded, 0, bounds.current.end - minLength); setStart(bounds.current.start); }
    else { bounds.current.end = clamp(rounded, bounds.current.start + minLength, total); setEnd(bounds.current.end); }
  }
  async function preview() {
    if (playing) { stop(); return; }
    if (!audio || !valid) return;
    const generation = ++playbackGeneration.current; setPlaying(true);
    try {
      const ctx = context.current!; await ctx.resume();
      if (generation !== playbackGeneration.current) return;
      const node = ctx.createBufferSource(); node.buffer = audio; node.connect(ctx.destination); source.current = node;
      const first = Math.round(start * audio.sampleRate) / audio.sampleRate;
      const last = Math.round(end * audio.sampleRate) / audio.sampleRate;
      const began = ctx.currentTime; node.onended = () => { node.disconnect(); if (source.current === node) { source.current = undefined; setPlaying(false); setPlayhead(undefined); } };
      node.start(0, first, last - first); setPlaying(true);
      const tick = () => { if (source.current !== node) return; setPlayhead(Math.min(last, first + ctx.currentTime - began)); requestAnimationFrame(tick); }; tick();
    } catch { if (generation === playbackGeneration.current) { setPlaying(false); setError('Playback could not start. Try again.'); } }
  }
  function finish() {
    if (!audio || !valid || unchanged) return;
    try { stop(); const data = trimToWav(audio, start, end); apply(new File([data], `${filename.current.replace(/\.[^.]+$/, '').replace(/-trimmed$/, '')}-trimmed.wav`, { type: 'audio/wav' })); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not trim this audio.'); }
  }

  return <Modal title="Trim" subtitle="" wide close={close} neutral hideTitle>
    {loading && <p role="status" className="py-16 text-center text-sm text-neutral-400">Loading waveform…</p>}
    {error && <Notice>{error}</Notice>}
    {audio && <div className="space-y-5">
      <p className="truncate pr-12 text-xs text-neutral-400">{filename.current}</p>
      <TrimWaveform audio={audio} start={start} end={end} playhead={playhead} change={changeEdge} />
      <p className="text-center text-xs text-neutral-400">Drag the handles. Pinch to zoom. Drag the waveform to move.</p>
      {size > 10_000_000 && <Notice>The selected WAV exceeds 10 MB. Keep a shorter range before applying.</Notice>}
      <div className="flex items-center justify-end gap-3 pt-1">
        <button type="button" className="mr-auto rounded-lg px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100 focus-visible:outline-neutral-500" disabled={!valid} onClick={() => void preview()}>{playing ? 'Stop' : 'Preview'}</button>
        <button type="button" className="rounded-lg bg-neutral-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 focus-visible:outline-neutral-500 disabled:!cursor-default" disabled={!valid || unchanged || size > 10_000_000} onClick={finish}>Apply trim</button>
      </div>
    </div>}
  </Modal>;
}
