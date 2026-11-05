import { useCallback, useEffect, useRef, useState } from 'react';
import { MicrophoneRecorder } from '../lib/recorder';
import { Notice, Symbol } from './LibraryUI';

export function RecordingInput({ file, disabled, change, capturing }: { file?: File; disabled: boolean; change: (file: File) => void; capturing: (active: boolean) => void }) {
  const [phase, setPhase] = useState<'idle' | 'permission' | 'recording' | 'stopping'>('idle');
  const [seconds, setSeconds] = useState(0); const [error, setError] = useState(''); const [url, setUrl] = useState('');
  const recorder = useRef<MicrophoneRecorder | undefined>(undefined); const input = useRef<HTMLInputElement>(null); const preview = useRef<HTMLAudioElement>(null);
  const setPreview = useCallback((node: HTMLAudioElement | null) => { if (!node) preview.current?.pause(); preview.current = node; }, []);
  useEffect(() => () => recorder.current?.dispose(), []);
  useEffect(() => { if (!file) { setUrl(''); return; } const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]);
  function start() {
    if (phase !== 'idle' || disabled) return;
    preview.current?.pause(); setError(''); setSeconds(0); setPhase('permission'); capturing(true);
    recorder.current = new MicrophoneRecorder({
      ready: () => setPhase('recording'), progress: setSeconds,
      complete: next => { setPhase('idle'); capturing(false); change(next); },
      error: message => { setPhase('idle'); capturing(false); setError(message); },
    });
    void recorder.current.start();
  }
  const active = phase !== 'idle';
  return <div className="space-y-4">
    <div className="flex flex-col items-center rounded-xl bg-neutral-100 px-5 py-7">
      <button type="button" className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-800 text-white transition-colors hover:bg-neutral-700" disabled={disabled || phase === 'permission' || phase === 'stopping'} aria-label={phase === 'recording' ? 'Stop recording' : file ? 'Record again' : 'Start recording'} onClick={() => { if (phase === 'recording') { setPhase('stopping'); recorder.current?.stop(); } else start(); }}>
        {phase === 'recording' ? <span className="h-5 w-5 rounded-sm bg-white" /> : <Symbol name="mic" className="!h-7 !w-7" />}
      </button>
      <p role="status" className="mt-3 text-sm text-neutral-600">{phase === 'permission' ? 'Allow microphone access…' : phase === 'stopping' ? 'Preparing audio…' : phase === 'recording' ? 'Recording' : file ? 'Record again' : 'Start recording'}</p>
      {phase === 'recording' && <p className="mt-1 text-xl tabular-nums text-neutral-800">{Math.floor(seconds / 60)}:{(seconds % 60).toFixed(1).padStart(4, '0')}</p>}
      {!active && url && <audio ref={setPreview} className="mt-5 h-10 w-full" aria-label="Recording preview" controls preload="metadata" src={url} />}
    </div>
    {error && <Notice>{error}</Notice>}
    <div className="flex items-center justify-between gap-3"><button type="button" className="text-xs text-neutral-500 underline underline-offset-4 hover:text-neutral-800" disabled={disabled || active} onClick={() => input.current?.click()}>Import audio</button><span className="min-w-0 truncate text-xs text-neutral-500">{file && !active ? file.name : 'WAV · Up to 10 MB'}</span></div>
    <input ref={input} type="file" className="hidden" aria-label="Import audio file" accept=".wav,.mp3,audio/wav,audio/mpeg" disabled={disabled || active} onChange={event => { const next = event.target.files?.[0]; event.target.value = ''; if (!next) return; if (!next.size || next.size > 10_000_000) { setError('Choose a WAV or MP3 of 10 MB or less.'); return; } setError(''); change(next); }} />
  </div>;
}
