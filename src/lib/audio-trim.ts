export interface PcmAudio {
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}
export interface MillisecondLevel { min: number; max: number; peak: number; rms: number }
export const toDb = (amplitude: number) => amplitude > 0 ? 20 * Math.log10(amplitude) : -Infinity;
export const dbLabel = (amplitude: number) => amplitude > 0 ? `${toDb(amplitude).toFixed(1)} dBFS` : '−∞ dBFS';

// Use source samples (not RMS bins) so brief transients remain visible at any zoom.
export function waveformEnvelope(audio: PcmAudio, start: number, end: number, width: number) {
  const first = Math.max(0, Math.floor(start * audio.sampleRate));
  const last = Math.min(audio.length, Math.ceil(end * audio.sampleRate));
  const count = Math.min(Math.max(1, Math.floor(width)), last - first);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
  return Array.from({ length: count }, (_, column) => {
    const from = first + Math.floor(column * (last - first) / count);
    const to = first + Math.floor((column + 1) * (last - first) / count);
    let min = Infinity, max = -Infinity;
    for (const channel of channels) for (let i = from; i < to; i++) { min = Math.min(min, channel[i]); max = Math.max(max, channel[i]); }
    return { time: (from + to) / 2 / audio.sampleRate, min, max };
  });
}

// Never average channel samples together: opposite-phase stereo must not disappear.
export function millisecondLevels(audio: PcmAudio): MillisecondLevel[] {
  const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
  return Array.from({ length: Math.ceil(audio.length / audio.sampleRate * 1000) }, (_, ms) => {
    const first = Math.floor(ms * audio.sampleRate / 1000);
    const last = Math.min(audio.length, Math.floor((ms + 1) * audio.sampleRate / 1000));
    let min = 0, max = 0, sum = 0, count = 0;
    for (const channel of channels) for (let i = first; i < last; i++) {
      const value = channel[i]; min = Math.min(min, value); max = Math.max(max, value);
      sum += value * value; count++;
    }
    return { min, max, peak: Math.max(-min, max), rms: count ? Math.sqrt(sum / count) : 0 };
  });
}

export function trimFrames(audio: PcmAudio, start: number, end: number) {
  const duration = audio.length / audio.sampleRate;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > duration + 1e-9 || start >= end) throw new Error('Choose a start before the end, within this sound.');
  const first = Math.round(start * audio.sampleRate);
  const last = Math.min(audio.length, Math.round(end * audio.sampleRate));
  if (last <= first) throw new Error('Keep at least one audio sample.');
  return { first, last, count: last - first };
}

export function wavSize(audio: PcmAudio, start: number, end: number) {
  return 44 + trimFrames(audio, start, end).count * audio.numberOfChannels * 2;
}

// PCM16, interleaved channels. Cropping does not normalize, fade or change pitch.
export function trimToWav(audio: PcmAudio, start: number, end: number): ArrayBuffer {
  const { first, count } = trimFrames(audio, start, end);
  const size = wavSize(audio, start, end);
  if (size > 10_000_000) throw new Error('This WAV would exceed 10 MB. Select a shorter range.');
  const result = new ArrayBuffer(size); const view = new DataView(result);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, size - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, audio.numberOfChannels, true);
  view.setUint32(24, audio.sampleRate, true); view.setUint32(28, audio.sampleRate * audio.numberOfChannels * 2, true);
  view.setUint16(32, audio.numberOfChannels * 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, size - 44, true);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
  let offset = 44;
  for (let frame = first; frame < first + count; frame++) for (const channel of channels) {
    const value = Math.max(-1, Math.min(1, channel[frame]));
    view.setInt16(offset, Math.round(value * (value < 0 ? 32768 : 32767)), true); offset += 2;
  }
  return result;
}
