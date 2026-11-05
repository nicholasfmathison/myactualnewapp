import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { api, fileSize, type Track } from '../lib/api';
import { millisecondLevels, waveformEnvelope, trimToWav, wavSize, type MillisecondLevel } from '../lib/audio-trim';
import { Modal, Notice } from './LibraryUI';

const WIDTH = 900, LEFT = 48, RIGHT = 884, PLOT = RIGHT - LEFT;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function TrimEditor({ track, file, close, apply }: { track?: Track; file?: File; close: () => void; apply: (file: File) => void }) {
  const [audio, setAudio] = useState<AudioBuffer>(); const [levels, setLevels] = useState<MillisecondLevel[]>([]);
  const [start, setStart] = useState(0); const [end, setEnd] = useState(0); const [hover, setHover] = useState(0);
  const [windowSize, setWindowSize] = useState(0); const [pan, setPan] = useState(0);
  const [edge, setEdge] = useState<'start' | 'end'>('start'); const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState<number>(); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const context = useRef<AudioContext | undefined>(undefined); const source = useRef<AudioBufferSourceNode | undefined>(undefined); const drag = useRef<'start' | 'end' | undefined>(undefined);
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
        setAudio(buffer); setLevels(millisecondLevels(buffer)); setEnd(buffer.duration);
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : 'This audio could not be decoded.'); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; playbackGeneration.current++; controller.abort(); if (source.current) { source.current.onended = null; source.current.stop(); source.current = undefined; } void ctx.close(); };
  }, [file, track]);

  const total = audio?.duration ?? 0;
  const span = Math.min(windowSize || total, total);
  const viewStart = clamp(pan, 0, Math.max(0, total - span)); const viewEnd = viewStart + span;
  const x = (time: number) => LEFT + (time - viewStart) / span * PLOT;
  const valid = !!audio && start >= 0 && end <= total && end > start && Math.round(end * audio.sampleRate) > Math.round(start * audio.sampleRate);
  const size = valid ? wavSize(audio!, start, end) : 0;
  const unchanged = start === 0 && end === total;
  const inspectMs = Math.min(levels.length - 1, Math.floor(hover * 1000 + 1e-7));
  const selected = levels[inspectMs];

  function changeEdge(which: 'start' | 'end', time: number) {
    stop(); setError(''); const minLength = 1 / audio!.sampleRate;
    const rounded = Math.round(time * 1000) / 1000;
    if (which === 'start') setStart(clamp(rounded, 0, end - minLength));
    else setEnd(clamp(rounded, start + minLength, total));
  }
  function pointerTime(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return clamp(viewStart + ((event.clientX - bounds.left) / bounds.width * WIDTH - LEFT) / PLOT * span, viewStart, viewEnd);
  }
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    const time = pointerTime(event); const threshold = span * .025;
    drag.current = Math.abs(time - start) < threshold ? 'start' : Math.abs(time - end) < threshold ? 'end' : edge;
    setEdge(drag.current); event.currentTarget.setPointerCapture(event.pointerId); changeEdge(drag.current, time); setHover(time);
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

  const columns = useMemo(() => audio ? waveformEnvelope(audio, viewStart, viewEnd, PLOT) : [], [audio, viewStart, viewEnd]);
  const waveY = (value: number) => 145 - clamp(value, -1, 1) * 117;
  const wavePath = columns.map((c, i) => `${i ? 'L' : 'M'}${x(c.time).toFixed(2)},${waveY(c.max).toFixed(2)}`).join(' ') + ' ' + [...columns].reverse().map(c => `L${x(c.time).toFixed(2)},${waveY(c.min).toFixed(2)}`).join(' ') + (columns.length ? ' Z' : '');
  return <Modal title="Trim your sound" subtitle="KEEP JUST THE PART YOU NEED" wide close={close}>
    {loading && <p role="status" className="py-14 text-center text-sm text-stone-500">Decoding audio and measuring each millisecond…</p>}
    {error && <Notice>{error}</Notice>}
    {audio && <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="min-w-0 truncate text-sm text-stone-500">{filename.current}</p><span className="pill">{total.toFixed(3)} s · {audio.sampleRate / 1000} kHz · {audio.numberOfChannels === 1 ? 'Mono' : 'Stereo'}</span></div>
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2">{(['start', 'end'] as const).map(which => <button type="button" key={which} aria-pressed={edge === which} className={edge === which ? 'primary !px-3 !py-2 !text-xs' : 'secondary !px-3 !py-2 !text-xs'} onClick={() => setEdge(which)}>Set {which}</button>)}</div><label className="flex items-center gap-2 text-xs text-stone-500">Zoom<select aria-label="Waveform zoom" className="rounded-lg border border-stone-200 bg-white p-2" value={windowSize} onChange={e => { const next = Number(e.target.value); setWindowSize(next); setPan(clamp(hover - next / 2, 0, Math.max(0, total - next))); }}><option value={0}>Fit sound</option>{[1, .1, .02].filter(value => value < total).map(value => <option key={value} value={value}>{value * 1000} ms window</option>)}</select></label></div>
      <div className="overflow-hidden rounded-xl border border-[#dce3d4] bg-[#343b4c]">
        <svg viewBox={`0 0 ${WIDTH} 300`} className="block w-full touch-none select-none" role="img" aria-label="Audio waveform. Drag start and end markers, or use the time fields below." onPointerDown={pointerDown} onPointerMove={event => { const time = pointerTime(event); setHover(time); if (drag.current) changeEdge(drag.current, time); }} onPointerUp={event => { drag.current = undefined; event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { drag.current = undefined; }}>
          <defs><clipPath id="trim-plot"><rect x={LEFT} y={0} width={PLOT} height={278} /></clipPath></defs>
          <text x={LEFT} y={18} fontSize={10} fill="#c8d0df">WAVEFORM · ALL CHANNELS</text>
          {Array.from({ length: 33 }, (_, i) => <line key={i} x1={LEFT + i / 32 * PLOT} x2={LEFT + i / 32 * PLOT} y1={25} y2={272} stroke={i % 4 === 0 ? '#586173' : '#414a5c'} strokeWidth={.7} />)}
          {[.5, 0, -.5].map(level => <line key={level} x1={LEFT} x2={RIGHT} y1={waveY(level)} y2={waveY(level)} stroke={level === 0 ? '#8792a8' : '#485164'} strokeWidth={.7} />)}
          <g clipPath="url(#trim-plot)">
            <rect x={x(start)} y={25} width={Math.max(0, x(end) - x(start))} height={247} fill="#9ebc8a" opacity={.12} />
            <path d={wavePath} fill="#f1f3fc" stroke="#f1f3fc" strokeWidth={.7} strokeLinejoin="round" />
            <rect x={LEFT} y={25} width={clamp(x(start) - LEFT, 0, PLOT)} height={247} fill="#111827" opacity={.65} />
            <rect x={clamp(x(end), LEFT, RIGHT)} y={25} width={clamp(RIGHT - x(end), 0, PLOT)} height={247} fill="#111827" opacity={.65} />
            <line x1={x(hover)} x2={x(hover)} y1={25} y2={272} stroke="#b8c4d6" strokeDasharray="3 4" />
            {playhead !== undefined && <line x1={x(playhead)} x2={x(playhead)} y1={25} y2={272} stroke="#d68d32" strokeWidth={2} />}
            {[start, end].map((time, i) => <g key={i}><line x1={clamp(x(time), LEFT + 1, RIGHT - 1)} x2={clamp(x(time), LEFT + 1, RIGHT - 1)} y1={25} y2={272} stroke="#d7edb6" strokeWidth={2} opacity={time >= viewStart && time <= viewEnd ? 1 : 0} /><rect x={x(time) - 5} y={29} width={10} height={22} rx={3} fill="#d7edb6" /></g>)}
          </g>
          {Array.from({ length: 5 }, (_, i) => <text key={i} x={LEFT + i / 4 * PLOT} y={291} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'} fontSize={10} fill="#c8d0df">{((viewStart + span * i / 4) * 1000).toFixed(0)} ms</text>)}
        </svg>
        <div className="flex flex-wrap justify-between gap-2 border-t border-[#dce3d4] bg-[#f7f9f3] px-4 py-3 font-mono text-[11px] text-stone-600"><label className="flex items-center gap-2">Inspect (ms)<input aria-label="Inspect millisecond" type="number" min={0} max={levels.length - 1} step={1} value={inspectMs} className="w-20 rounded border border-stone-200 bg-white px-2 py-1" onChange={e => { const ms = clamp(Math.round(Number(e.target.value)), 0, levels.length - 1); setHover(ms / 1000); if (ms / 1000 < viewStart || ms / 1000 >= viewEnd) setPan(clamp(ms / 1000 - span / 2, 0, total - span)); }} /></label><span>Signal level {selected ? (selected.rms * 100).toFixed(1) : '0'}%</span><span>Peak {selected ? (selected.peak * 100).toFixed(1) : '0'}%</span></div>
      </div>
      {span < total && <label className="field-label">Move through sound<input aria-label="Waveform position" type="range" min={0} max={Math.max(0, total - span)} step={.001} value={viewStart} onChange={e => setPan(Number(e.target.value))} className="mt-2 w-full accent-[#53713e]" /></label>}
      <p className="text-xs leading-5 text-stone-500">Drag either edge to crop. The waveform shows the actual audio samples: taller peaks are stronger signals, and a flat line is silence. Dimmed areas will be removed. Zoom in for fine detail, or enter exact start and end times below.</p>
      <div className="grid grid-cols-2 gap-4"><label className="field-label">Start (seconds)<input aria-label="Trim start in seconds" type="number" min={0} max={end} step="0.001" value={Number(start.toFixed(6))} onChange={e => { if (e.target.value !== '') changeEdge('start', Number(e.target.value)); }} className="field font-mono" /></label><label className="field-label">End (seconds)<input aria-label="Trim end in seconds" type="number" min={start} max={total} step="0.001" value={Number(end.toFixed(6))} onChange={e => { if (e.target.value !== '') changeEdge('end', Number(e.target.value)); }} className="field font-mono" /></label></div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f4f5ef] p-4"><div><p className="text-sm font-medium">Keeping {(end - start).toFixed(3)} seconds</p><p className="mt-1 text-xs text-stone-500">Removing {start.toFixed(3)} s from the start · {(total - end).toFixed(3)} s from the end</p></div><button type="button" className="secondary" disabled={!valid} onClick={() => void preview()}>{playing ? 'Stop preview' : 'Preview selection'}</button></div>
      {size > 10_000_000 && <Notice>The selected WAV exceeds 10 MB. Keep a shorter range before applying.</Notice>}
      <p className="text-xs leading-5 text-stone-500">Trimmed audio is saved as a 16-bit WAV ({fileSize(size)}), including MP3 sources. Your original saved version stays in history. Apply the trim, then save the version to keep it.</p>
      <div className="flex flex-wrap justify-end gap-3"><button type="button" className="secondary" onClick={() => { stop(); setStart(0); setEnd(total); setError(''); }}>Reset range</button><button type="button" className="secondary" onClick={close}>Cancel</button><button type="button" className="primary" disabled={!valid || unchanged || size > 10_000_000} onClick={finish}>Apply trim</button></div>
    </div>}
  </Modal>;
}
