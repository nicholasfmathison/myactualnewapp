import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { waveformEnvelope } from '../lib/audio-trim';
import { zoomAudioWindow } from '../lib/trim-viewport';

export type TrimLayout = 'minimal' | 'simple' | 'guided';
type Edge = 'start' | 'end';
type Contact = { x: number; y: number; edge?: Edge; offset: number; initialPan: number; initialX: number };
const WIDTH = 900, LEFT = 24, RIGHT = 876, PLOT = RIGHT - LEFT;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function TrimWaveform({ audio, start, end, layout, playhead, change }: {
  audio: AudioBuffer; start: number; end: number; layout: TrimLayout; playhead?: number;
  change: (edge: Edge, value: number) => void;
}) {
  const total = audio.duration;
  const [viewport, setViewport] = useState({ start: 0, span: total });
  const [active, setActive] = useState<Edge>();
  const surface = useRef<HTMLDivElement>(null);
  const contacts = useRef(new Map<number, Contact>());
  const pinch = useRef<{ distance: number; center: number; start: number; span: number } | undefined>(undefined);
  const currentView = useRef(viewport); currentView.current = viewport;
  const plotWidth = () => surface.current!.getBoundingClientRect().width * PLOT / WIDTH;
  const fractionAt = (clientX: number) => clamp(((clientX - surface.current!.getBoundingClientRect().left) / surface.current!.getBoundingClientRect().width * WIDTH - LEFT) / PLOT, 0, 1);
  const timeAt = (clientX: number) => viewport.start + fractionAt(clientX) * viewport.span;
  const x = (time: number) => LEFT + (time - viewport.start) / viewport.span * PLOT;
  const zoomed = viewport.span < total - 1e-9;
  const dark = layout === 'simple';
  const waveform = useMemo(() => waveformEnvelope(audio, viewport.start, viewport.start + viewport.span, PLOT), [audio, viewport]);
  const y = (value: number) => 130 - clamp(value, -1, 1) * 100;
  const path = waveform.map((point, i) => `${i ? 'L' : 'M'}${x(point.time).toFixed(2)},${y(point.max).toFixed(2)}`).join(' ') + ' ' + [...waveform].reverse().map(point => `L${x(point.time).toFixed(2)},${y(point.min).toFixed(2)}`).join(' ') + ' Z';

  // Trackpad pinch is delivered as a control-wheel event by desktop browsers.
  useEffect(() => {
    const element = surface.current!;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const anchor = ((event.clientX - rect.left) / rect.width * WIDTH - LEFT) / PLOT;
      setViewport(view => zoomAudioWindow(total, view.start, view.span, anchor, Math.exp(clamp(event.deltaY, -100, 100) * .01)));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [total]);

  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = (event.target as Element).closest<HTMLElement>('[data-trim-edge]');
    const edge = target?.dataset.trimEdge as Edge | undefined;
    contacts.current.set(event.pointerId, { x: event.clientX, y: event.clientY, edge,
      offset: edge ? timeAt(event.clientX) - (edge === 'start' ? start : end) : 0,
      initialPan: viewport.start, initialX: event.clientX });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (edge) setActive(edge);
    const points = [...contacts.current.values()];
    // Two fingers on the two handles trim independently. Elsewhere, pinch zooms.
    if (points.length === 2 && !(points[0].edge && points[1].edge && points[0].edge !== points[1].edge)) {
      pinch.current = { distance: Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)),
        center: fractionAt((points[0].x + points[1].x) / 2), start: viewport.start, span: viewport.span };
      setActive(undefined);
    }
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const contact = contacts.current.get(event.pointerId); if (!contact) return;
    contact.x = event.clientX; contact.y = event.clientY;
    const points = [...contacts.current.values()];
    if (pinch.current && points.length >= 2) {
      const initial = pinch.current;
      const distance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
      const next = zoomAudioWindow(total, initial.start, initial.span, initial.center, initial.distance / distance);
      const centerNow = fractionAt((points[0].x + points[1].x) / 2);
      next.start = clamp(initial.start + initial.center * initial.span - centerNow * next.span, 0, total - next.span);
      setViewport(next);
    } else if (contact.edge) {
      change(contact.edge, timeAt(event.clientX) - contact.offset);
    } else if (zoomed) {
      setViewport(view => ({ ...view, start: clamp(contact.initialPan - (event.clientX - contact.initialX) / plotWidth() * view.span, 0, total - view.span) }));
    }
  }
  function up(event: PointerEvent<HTMLDivElement>) {
    contacts.current.delete(event.pointerId); pinch.current = undefined; setActive(undefined);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    // Rebase a remaining touch so lifting one finger cannot jump the viewport.
    for (const contact of contacts.current.values()) {
      contact.initialPan = currentView.current.start; contact.initialX = contact.x;
      if (contact.edge) contact.offset = currentView.current.start + fractionAt(contact.x) * currentView.current.span - (contact.edge === 'start' ? start : end);
    }
  }

  return <div className="space-y-3">
    {zoomed && <div className="flex justify-end"><button type="button" className="text-xs text-neutral-500 underline underline-offset-4" onClick={() => setViewport({ start: 0, span: total })}>Fit whole sound</button></div>}
    <div ref={surface} className={`relative touch-none select-none overflow-hidden ${layout === 'minimal' ? 'rounded-lg bg-neutral-100' : dark ? 'rounded-2xl bg-neutral-800' : 'rounded-xl border border-neutral-200 bg-neutral-50'} ${zoomed ? 'cursor-grab active:cursor-grabbing' : ''}`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={event => { contacts.current.delete(event.pointerId); if (!contacts.current.size) { pinch.current = undefined; setActive(undefined); } }}>
      <svg viewBox={`0 0 ${WIDTH} 260`} className="block w-full" role="img" aria-label="Sound waveform">
        <defs><clipPath id="trim-wave-area"><rect x={LEFT} width={PLOT} height={260} /></clipPath></defs>
        {layout === 'guided' && Array.from({ length: 17 }, (_, i) => <line key={i} x1={LEFT + i * PLOT / 16} x2={LEFT + i * PLOT / 16} y1={20} y2={240} stroke="#e5e5e5" />)}
        <line x1={LEFT} x2={RIGHT} y1={130} y2={130} stroke={dark ? '#525252' : '#d4d4d4'} />
        <g clipPath="url(#trim-wave-area)">
          <path d={path} fill={dark ? '#e5e5e5' : '#737373'} stroke={dark ? '#e5e5e5' : '#737373'} strokeWidth={.6} />
          <rect x={LEFT} width={clamp(x(start) - LEFT, 0, PLOT)} height={260} fill={dark ? '#171717' : '#fafafa'} opacity={.85} />
          <rect x={clamp(x(end), LEFT, RIGHT)} width={clamp(RIGHT - x(end), 0, PLOT)} height={260} fill={dark ? '#171717' : '#fafafa'} opacity={.85} />
          {playhead !== undefined && <line x1={x(playhead)} x2={x(playhead)} y1={20} y2={240} stroke={dark ? '#fff' : '#171717'} strokeWidth={2} />}
        </g>
      </svg>
      {(['start', 'end'] as const).map(edge => {
        const value = edge === 'start' ? start : end;
        const visible = value >= viewport.start - 1e-9 && value <= viewport.start + viewport.span + 1e-9;
        return visible && <button key={edge} type="button" role="slider" aria-label={`Trim ${edge}`} aria-valuemin={edge === 'start' ? 0 : start} aria-valuemax={edge === 'end' ? total : end} aria-valuenow={value} aria-valuetext={`${value.toFixed(3)} seconds`} data-trim-edge={edge}
          className="absolute inset-y-0 z-10 flex w-11 -translate-x-1/2 cursor-ew-resize items-center justify-center rounded focus-visible:outline-neutral-500"
          style={{ left: `${clamp(x(value), LEFT, RIGHT) / WIDTH * 100}%` }}
          onKeyDown={event => {
            const step = event.shiftKey ? .01 : .001;
            if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault(); change(edge, event.key === 'Home' ? 0 : event.key === 'End' ? total : value + (['ArrowLeft', 'ArrowDown'].includes(event.key) ? -step : step));
            }
          }}>
          <span className={`flex h-[84%] w-3.5 items-center justify-center rounded ${dark ? 'bg-neutral-100' : 'bg-neutral-600'} ${active === edge ? 'shadow-lg' : ''}`}><span className={`h-7 w-0.5 rounded ${dark ? 'bg-neutral-500' : 'bg-neutral-200'}`} /></span>
        </button>;
      })}
    </div>
    {layout === 'guided' && <div className="flex justify-between px-1 font-mono text-[10px] text-neutral-400">{Array.from({ length: 5 }, (_, i) => <span key={i}>{(viewport.start + viewport.span * i / 4).toFixed(3)}s</span>)}</div>}
  </div>;
}
