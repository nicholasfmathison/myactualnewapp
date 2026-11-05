import { useState } from 'react';
import { applyFont, fontOptions, selectedFont } from '../lib/fonts';
import { Modal } from './LibraryUI';

export function FontPicker() {
  const [open, setOpen] = useState(false); const [selected, setSelected] = useState(selectedFont);
  return <><button type="button" className="flex h-11 items-center gap-2 rounded-xl px-3 text-sm text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-800" aria-label="Choose font" title="Choose font" onClick={() => setOpen(true)}><span className="text-lg tracking-tight" aria-hidden="true">Aa</span><span className="hidden sm:inline">Fonts</span></button>
    {open && <Modal title="Choose a font" subtitle="" close={() => setOpen(false)} neutral>
      <div className="space-y-2" role="group" aria-label="Font options">{fontOptions.map(font => <button type="button" key={font.id} aria-pressed={selected.id === font.id} aria-label={font.name} style={{ fontFamily: `"${font.family}", system-ui, sans-serif` }} className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${selected.id === font.id ? 'border-neutral-500 bg-neutral-100' : 'border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50'}`} onClick={() => { applyFont(font); setSelected(font); }}>
        <span className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{font.name}</span><span className="text-xs text-neutral-500">{font.description}</span></span>
        <span className="mt-1 block text-lg font-normal tracking-tight text-neutral-700">Small sounds. Clear ideas.</span>
      </button>)}</div>
      <div className="mt-5 flex items-center justify-between gap-4"><p className="text-xs text-neutral-500">Applies across your library.</p><button type="button" className="primary" onClick={() => setOpen(false)}>Done</button></div>
    </Modal>}
  </>;
}
