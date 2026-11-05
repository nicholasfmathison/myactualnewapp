import { useState, type CSSProperties } from 'react';
import { Icon } from './Icon';

const themes = [
  { name: 'Fern', color: '#d5edaa', ink: '#30472b', background: '#eff5e6' },
  { name: 'Lavender', color: '#ddd2fa', ink: '#51416f', background: '#f2eef9' },
  { name: 'Apricot', color: '#f9c8a4', ink: '#74472c', background: '#fcf0e6' },
] as const;

export function Playground() {
  const [title, setTitle] = useState('Something great starts here.');
  const [themeIndex, setThemeIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [showDetail, setShowDetail] = useState(true);
  const theme = themes[themeIndex];
  const customStyle = { '--accent': theme.color, '--accent-ink': theme.ink, '--accent-bg': theme.background } as CSSProperties;

  function reset() {
    setTitle('Something great starts here.');
    setThemeIndex(0);
    setCount(0);
    setShowDetail(true);
  }

  return (
    <section id="playground" className="scroll-mt-8" aria-labelledby="playground-title">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow mb-2">01 / THE PLAYGROUND</p><h2 id="playground-title" className="text-2xl font-semibold tracking-tight">A little change. Instantly yours.</h2></div>
        <span className="flex items-center gap-2 text-xs text-stone-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />Interactive preview</span>
      </div>
      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white lg:grid lg:grid-cols-[0.85fr_1.15fr]" style={customStyle}>
        <div className="p-6 sm:p-9">
          <div className="mb-8 flex items-center justify-between"><h3 className="font-semibold">Make it your own</h3><button onClick={reset} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 hover:text-ink"><Icon name="reset" className="h-3.5 w-3.5" />Reset</button></div>
          <label htmlFor="headline" className="mb-2 block text-sm font-medium">Your headline</label>
          <input id="headline" value={title} maxLength={80} onChange={event => setTitle(event.target.value)} placeholder="Give your idea a name" className="w-full rounded-xl border border-stone-200 bg-paper px-4 py-3 text-sm outline-none focus:border-stone-500" />
          <p className="mt-2 text-xs text-stone-500">A few words can be the start of something.</p>
          <fieldset className="mt-7"><legend className="mb-3 text-sm font-medium">Pick a mood</legend><div className="flex flex-wrap gap-2">
            {themes.map((option, index) => <button key={option.name} type="button" aria-pressed={themeIndex === index} onClick={() => setThemeIndex(index)} className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition-colors ${themeIndex === index ? 'border-ink bg-paper text-ink' : 'border-stone-200 text-stone-600 hover:border-stone-400'}`}><span className="h-3 w-3 rounded-full" style={{ backgroundColor: option.color }} />{option.name}</button>)}
          </div></fieldset>
          <div className="mt-7 flex items-center justify-between gap-4 border-t border-stone-100 pt-6"><div><p id="detail-label" className="text-sm font-medium">A little more detail</p><p className="mt-1 text-xs text-stone-500">Show the supporting text.</p></div><button type="button" role="switch" aria-checked={showDetail} aria-labelledby="detail-label" onClick={() => setShowDetail(value => !value)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${showDetail ? 'bg-ink' : 'bg-stone-300'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${showDetail ? 'left-1 translate-x-5' : 'left-1'}`} /></button></div>
        </div>
        <div className="preview-grid relative flex min-h-[390px] items-center justify-center border-t border-stone-200 p-6 sm:p-10 lg:border-l lg:border-t-0">
          <span className="absolute left-6 top-5 font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">Your canvas</span>
          <div className="relative w-full max-w-sm rounded-2xl border border-white bg-white p-7 shadow-[0_16px_50px_-24px_rgba(24,38,32,0.4)] sm:p-8">
            <div className="mb-6 flex items-center justify-between"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--accent-ink)]"><Icon name="spark" className="h-6 w-6" /></span><span className="rounded-full bg-[var(--accent-bg)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-ink)]">An idea in motion</span></div>
            <h3 className="break-words text-3xl font-semibold leading-[1.15] tracking-tight">{title.trim() || 'Your next great idea.'}</h3>
            {showDetail && <p className="mt-4 text-sm leading-relaxed text-stone-500">A fresh canvas, a curious mind, and room to make something that matters.</p>}
            <div className="mt-7 flex items-center justify-between border-t border-stone-100 pt-5"><span className="text-xs text-stone-500">Give it a little momentum</span><div className="flex items-center gap-2"><button aria-label="Decrease momentum" disabled={count === 0} onClick={() => setCount(value => Math.max(0, value - 1))} className="counter-button"><Icon name="minus" className="h-3 w-3" /></button><output aria-live="polite" aria-label="Momentum" className="min-w-6 text-center text-sm font-semibold tabular-nums">{count}</output><button aria-label="Increase momentum" onClick={() => setCount(value => value + 1)} className="counter-button bg-[var(--accent)]"><Icon name="plus" className="h-3 w-3" /></button></div></div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-right text-xs text-stone-400">Just an experiment. Refresh to start fresh.</p>
    </section>
  );
}
