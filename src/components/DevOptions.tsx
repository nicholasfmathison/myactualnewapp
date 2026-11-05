import { useEffect, useRef, useState } from 'react';

export function DevOptions() {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null); const trigger = useRef<HTMLButtonElement>(null); const firstLink = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  // These shortcuts are only for the local development server, never published builds.
  if (!import.meta.env.DEV) return null;
  const linkClass = 'block rounded-lg px-3 py-2.5 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900';
  const local = import.meta.env.VITE_USE_EMULATORS === 'true';
  const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '');
  return <div ref={container} className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-40" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" className="flex items-center gap-3 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-medium text-neutral-600 shadow-sm hover:bg-neutral-50" aria-expanded={open} aria-controls="dev-options-panel" onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); requestAnimationFrame(() => firstLink.current?.focus()); } }}>
      Dev options<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true"><path d="m4 10 4-4 4 4" /></svg>
    </button>
    {open && <nav id="dev-options-panel" aria-label="Developer tools" className="absolute bottom-full right-0 mb-2 max-h-[calc(100dvh-6rem)] w-60 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-2 shadow-lg">
      <a ref={firstLink} className={linkClass} href={`${import.meta.env.BASE_URL}tests/recording-browser.html`} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>Recording test</a>
      {apiBase && <a className={linkClass} href={`${apiBase}/v1/health`} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>API status</a>}
      {local && <a className={linkClass} href="http://127.0.0.1:4000/" target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>Firebase emulators</a>}
    </nav>}
  </div>;
}
