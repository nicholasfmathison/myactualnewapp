import { useCallback, useEffect, useRef, useState } from 'react';
import { MicrophoneRecorder } from '../lib/recorder';
import { Notice, Symbol } from './LibraryUI';

export function RecordingInput({ file, disabled, change, capturing }: { file?: File; disabled: boolean; change: (file: File) => void; capturing: (active: boolean) => void }) {
  const [phase, setPhase] = useState<'idle' | 'permission' | 'recording' | 'stopping'>('idle');
  const [seconds, setSeconds] = useState(0); const [error, setError] = useState(''); const [url, setUrl] = useState('');
  const [hint, setHint] = useState('');
  const phaseRef = useRef(phase);
  const held = useRef<{ pointer?: number; key?: string } | undefined>(undefined);
  const recorder = useRef<MicrophoneRecorder | undefined>(undefined); const input = useRef<HTMLInputElement>(null); const preview = useRef<HTMLAudioElement>(null);
  const setPreview = useCallback((node: HTMLAudioElement | null) => { if (!node) preview.current?.pause(); preview.current = node; }, []);
  useEffect(() => () => recorder.current?.dispose(), []);
  useEffect(() => { if (!file) { setUrl(''); return; } const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]);
  function updatePhase(next: typeof phase) { phaseRef.current = next; setPhase(next); }
  function start(input: { pointer?: number; key?: string }) {
    if (phaseRef.current !== 'idle' || held.current || disabled) return;
    held.current = input;
    preview.current?.pause(); setError(''); setHint(''); setSeconds(0); updatePhase('permission'); capturing(true);
    recorder.current = new MicrophoneRecorder({
      ready: () => updatePhase('recording'), progress: setSeconds,
      complete: next => { held.current = undefined; updatePhase('idle'); capturing(false); change(next); },
      error: message => { held.current = undefined; updatePhase('idle'); capturing(false); setError(message); },
    });
    void recorder.current.start();
  }
  function release() {
    if (!held.current) return;
    held.current = undefined;
    if (phaseRef.current === 'permission') {
      // A released press must never start recording when permission resolves later.
      recorder.current?.dispose(); updatePhase('idle'); capturing(false);
      setHint('Once microphone access is allowed, hold again to record.');
    } else if (phaseRef.current === 'recording') {
      updatePhase('stopping'); recorder.current?.stop();
    }
  }
  const releaseRef = useRef(release); releaseRef.current = release;
  useEffect(() => {
    const stop = () => releaseRef.current();
    const hidden = () => { if (document.hidden) stop(); };
    window.addEventListener('blur', stop); document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  const active = phase !== 'idle';
  return <div className="space-y-4">
    <div className="flex flex-col items-center rounded-xl bg-neutral-100 px-5 py-7">
      <button type="button" className="record-button flex h-16 w-16 touch-none select-none items-center justify-center rounded-full text-white transition-colors" disabled={disabled || phase === 'stopping'} aria-label="Hold to record" aria-describedby="record-hint"
        onPointerDown={event => { if (event.button !== 0 || !event.isPrimary || held.current || phaseRef.current !== 'idle' || disabled) return; event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); start({ pointer: event.pointerId }); }}
        onPointerUp={event => { if (held.current?.pointer !== event.pointerId) return; event.preventDefault(); release(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onPointerCancel={event => { if (held.current?.pointer === event.pointerId) release(); }}
        onLostPointerCapture={event => { if (held.current?.pointer === event.pointerId) release(); }}
        onKeyDown={event => { if (![' ', 'Enter'].includes(event.key)) return; event.preventDefault(); if (!event.repeat) start({ key: event.key }); }}
        onKeyUp={event => { if (![' ', 'Enter'].includes(event.key)) return; event.preventDefault(); if (held.current?.key === event.key) release(); }}
        onBlur={release} onContextMenu={event => event.preventDefault()} onClick={event => event.preventDefault()}>
        {phase === 'recording' ? <span className="h-5 w-5 rounded-sm bg-white" /> : <Symbol name="mic" className="!h-7 !w-7" />}
      </button>
      <p id="record-hint" role="status" className="mt-3 text-center text-sm text-neutral-600">{phase === 'permission' ? 'Allow microphone access…' : phase === 'stopping' ? 'Preparing audio…' : phase === 'recording' ? 'Release to stop' : hint || (file ? 'Hold to record again' : 'Hold to record')}</p>
      {phase === 'recording' && <p className="mt-1 text-xl tabular-nums text-neutral-800">{Math.floor(seconds / 60)}:{(seconds % 60).toFixed(1).padStart(4, '0')}</p>}
      {!active && url && <audio ref={setPreview} className="mt-5 h-10 w-full" aria-label="Recording preview" controls preload="metadata" src={url} />}
    </div>
    {error && <Notice>{error}</Notice>}
    <div className="flex items-center justify-between gap-3"><button type="button" className="text-xs text-neutral-500 underline underline-offset-4 hover:text-neutral-800" disabled={disabled || active} onClick={() => input.current?.click()}>Import audio</button><span className="min-w-0 truncate text-xs text-neutral-500">{file && !active ? file.name : 'WAV · Up to 10 MB'}</span></div>
    <input ref={input} type="file" className="hidden" aria-label="Import audio file" accept=".wav,.mp3,audio/wav,audio/mpeg" disabled={disabled || active} onChange={event => { const next = event.target.files?.[0]; event.target.value = ''; if (!next) return; if (!next.size || next.size > 10_000_000) { setError('Choose a WAV or MP3 of 10 MB or less.'); return; } setError(''); change(next); }} />
  </div>;
}
