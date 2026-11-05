import { useEffect, useRef, type ReactNode } from 'react';
export function Symbol({ name, className = '' }: { name: string; className?: string }) {
  const paths: Record<string, ReactNode> = {
    library: <path d="M4 5v14M9 5v14M14 5v14M18 5l3 14" />, plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    upload: <path d="M12 16V4m-5 5 5-5 5 5M4 15v5h16v-5" />, close: <path d="m6 6 12 12M6 18 18 6" />,
    history: <path d="M3 10a9 9 0 1 1 1 7M3 4v6h6M12 7v5l3 2" />, play: <path d="m9 5 11 7-11 7z" />,
    edit: <path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z" />,
    trim: <><circle cx="5" cy="5" r="3" /><circle cx="5" cy="19" r="3" /><path d="m7 7 14 14M7 17 21 3" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V6a4 4 0 0 1 8 0v4" /></>,
    logout: <path d="M9 4H4v16h5m5-13 5 5-5 5m-5-5h10" />, arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`h-5 w-5 ${className}`}>{paths[name] ?? paths.library}</svg>;
}
export function Brand() { return <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d7edb6] text-[#253c30]"><Symbol name="library" /></span><div><span className="text-lg font-semibold tracking-tight">Soundroom</span><span className="block text-[10px] tracking-[.2em] text-stone-400">YOUR PRIVATE COLLECTION</span></div></div>; }
export function Notice({ children }: { children: ReactNode }) { return <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{children}</p>; }
export function Modal({ title, subtitle, children, close, wide = false }: { title: string; subtitle: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); close(); }} className={`modal ${wide ? '!max-w-5xl' : ''}`}><div className="mb-7 flex items-start justify-between gap-4"><div><p className="eyebrow mb-2">{subtitle}</p><h2 className="text-2xl font-semibold tracking-tight">{title}</h2></div><button className="icon-button" onClick={close} aria-label="Close dialog"><Symbol name="close" /></button></div>{children}</dialog>;
}
