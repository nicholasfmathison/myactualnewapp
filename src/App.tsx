import { Icon } from './components/Icon';
import { Playground } from './components/Playground';

const resources = [
  { number: '01', title: 'Think in components', description: 'Small pieces. Big possibilities.', label: 'Explore React', href: 'https://react.dev/learn', tag: 'React 19', className: 'bg-[#e7f0f3] text-[#466775]' },
  { number: '02', title: 'Build with confidence', description: 'A little structure for your big ideas.', label: 'Explore TypeScript', href: 'https://www.typescriptlang.org/docs/', tag: 'TypeScript 5.8', className: 'bg-[#e9eaf7] text-[#5a608f]' },
  { number: '03', title: 'Find your own style', description: 'Make every detail feel like you.', label: 'Explore Tailwind', href: 'https://v3.tailwindcss.com/docs', tag: 'Tailwind CSS 3', className: 'bg-[#f5ecdf] text-[#89704f]' },
];

export default function App() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-stone-200/80"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-10"><a href="#" className="flex items-center gap-3 rounded-lg" aria-label="My Actual New App home"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-lg font-semibold text-[#d5edaa]">m<span className="text-white">.</span></span><span className="text-sm font-semibold tracking-tight">myactualnewapp<span className="ml-2 align-middle text-[10px] font-normal text-stone-400">/</span></span></a><nav aria-label="Main navigation" className="flex items-center gap-5 text-xs font-medium sm:gap-7"><a className="text-stone-500 hover:text-ink" href="#playground">Playground</a><a className="text-stone-500 hover:text-ink" href="#toolkit">The toolkit</a><a href="https://github.com/nicholasfmathison/myactualnewapp" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full border border-stone-300 px-4 py-2 hover:bg-white">View source<Icon name="external" className="h-3 w-3" /></a></nav></div></header>
      <main className="mx-auto max-w-6xl px-6 pb-16 sm:px-10">
        <section className="relative grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-[1.3fr_0.7fr]" aria-labelledby="welcome-title">
          <div><div className="mb-6 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />A new beginning · v0.1</div><h1 id="welcome-title" className="text-5xl font-semibold leading-[1.04] tracking-[-0.055em] sm:text-6xl lg:text-[68px]">Your next idea<br />starts <span className="font-serif font-normal italic text-[#789157]">right here.</span></h1><p className="mt-6 max-w-md text-base leading-relaxed text-stone-500">A little space to experiment, a solid place to start.<br className="hidden sm:block" />Make a change. See what happens. Make it yours.</p><a href="#playground" className="mt-8 inline-flex items-center gap-6 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-[#38503f]">Try the playground<Icon name="arrow" className="h-4 w-4" /></a></div>
          <div aria-hidden="true" className="relative mx-auto hidden h-[290px] w-[290px] items-center justify-center sm:flex">
            <div className="absolute h-64 w-64 rounded-full border border-stone-200" /><div className="absolute h-48 w-48 rounded-full border border-dashed border-stone-300" />
            <div className="absolute left-4 top-12 rotate-[-12deg] rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"><Icon name="code" className="h-8 w-8 text-stone-400" /></div>
            <div className="absolute bottom-7 right-3 rotate-[12deg] rounded-2xl bg-[#e7e1f0] px-5 py-4 font-mono text-lg text-[#827392]">hello, world.</div>
            <div className="seed-mark relative h-36 w-36 rounded-[38px] bg-[#d5edaa] shadow-[0_20px_50px_-20px_#8da670]"><div className="absolute left-9 top-9 h-10 w-10 rounded-[0_24px_0_24px] bg-[#3a5733]" /><div className="absolute right-9 top-9 h-10 w-10 rounded-[24px_0_24px_0] bg-[#789157]" /><div className="absolute left-[70px] top-[71px] h-10 w-1 rounded-full bg-[#3a5733]" /></div>
            <span className="absolute right-4 top-10 text-3xl text-[#9ba98d]">✳</span><span className="absolute bottom-8 left-9 h-3 w-3 rounded-full bg-[#ccad87]" />
          </div>
        </section>
        <Playground />
        <section id="toolkit" className="mt-14 scroll-mt-8" aria-labelledby="toolkit-title"><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow mb-2">02 / THE BUILDING BLOCKS</p><h2 id="toolkit-title" className="text-2xl font-semibold tracking-tight">Simple tools. Plenty of possibility.</h2></div><span className="text-xs text-stone-400">A small stack, ready to grow.</span></div><div className="grid gap-4 md:grid-cols-3">{resources.map(resource => <a key={resource.number} href={resource.href} target="_blank" rel="noreferrer" className="group rounded-2xl border border-stone-200 bg-white/60 p-6 transition-colors hover:border-stone-400 hover:bg-white"><div className="mb-6 flex items-center justify-between"><span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${resource.className}`}>{resource.tag}</span><Icon name="external" className="h-3.5 w-3.5 text-stone-400 group-hover:text-ink" /></div><h3 className="text-base font-semibold tracking-tight">{resource.title}</h3><p className="mt-2 text-xs leading-relaxed text-stone-500">{resource.description}</p><p className="mt-6 flex items-center gap-2 text-xs font-medium">{resource.label}<Icon name="arrow" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></p></a>)}</div></section>
      </main>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-stone-200 px-6 py-6 text-[11px] text-stone-400 sm:px-10"><p>Made for the things you haven’t made yet.</p><span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#9bb780]" />A work in possibility.</span></footer>
    </div>
  );
}
