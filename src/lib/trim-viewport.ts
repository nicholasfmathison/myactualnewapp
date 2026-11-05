export function zoomAudioWindow(total: number, start: number, span: number, anchor: number, factor: number) {
  const fraction = Math.max(0, Math.min(1, anchor));
  const nextSpan = Math.max(Math.min(.02, total), Math.min(total, span * factor));
  return { span: nextSpan, start: Math.max(0, Math.min(total - nextSpan, start + fraction * (span - nextSpan))) };
}
