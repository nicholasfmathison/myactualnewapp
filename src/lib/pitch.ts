import type { PcmAudio } from './audio-trim.ts';

export interface Tuning { frequency: number; target: number; ratio: number; note: string; targetNote: string; cents: number }
const notes = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export function tuningFor(frequency: number): Tuning {
  if (!Number.isFinite(frequency) || frequency <= 0) throw new Error('Invalid pitch.');
  const midi = 69 + 12 * Math.log2(frequency / 440), nearest = Math.round(midi);
  const c = 12 * Math.round(midi / 12), target = 440 * 2 ** ((c - 69) / 12);
  return { frequency, target, ratio: target / frequency, note: `${notes[((nearest % 12) + 12) % 12]}${Math.floor(nearest / 12) - 1}`, targetNote: `C${c / 12 - 1}`, cents: (c - midi) * 100 };
}

// YIN cumulative mean normalized difference, with sub-sample interpolation.
function framePitch(samples: Float32Array, rate: number): number | null {
  const half = Math.floor(samples.length / 2), max = Math.min(half - 2, Math.ceil(rate / 25));
  let mean = 0; for (const value of samples) mean += value / samples.length;
  let power = 0; for (const value of samples) power += (value - mean) ** 2 / samples.length;
  if (power < 1e-8) return null;
  const difference = new Float64Array(max + 1), raw = new Float64Array(max + 1); let sum = 0;
  difference[0] = 1;
  for (let lag = 1; lag <= max; lag++) {
    let d = 0; for (let i = 0; i < half; i++) d += (samples[i] - samples[i + lag]) ** 2;
    raw[lag] = d; sum += d; difference[lag] = sum > 0 ? d * lag / sum : 1;
  }
  for (let lag = Math.max(2, Math.floor(rate / 1800)); lag < max; lag++) {
    if (difference[lag] >= .12) continue;
    while (lag + 1 < max && difference[lag + 1] < difference[lag]) lag++;
    if (difference[lag] > .1) return null;
    // Refine on the raw difference curve; normalization biases short-period estimates.
    const a = raw[lag - 1], b = raw[lag], c = raw[lag + 1];
    const correction = (a - c) / (2 * (a - 2 * b + c));
    const frequency = rate / (lag + (Number.isFinite(correction) ? Math.max(-1, Math.min(1, correction)) : 0));
    return frequency >= 25 && frequency <= 1800 ? frequency : null;
  }
  return null;
}

// At most 16 short windows per channel. Low-pass before decimation to avoid aliasing.
// Analyze channels separately: opposite-phase stereo must not cancel its fundamental.
export function detectPitch(audio: PcmAudio): Tuning | null {
  if (!Number.isFinite(audio.sampleRate) || audio.sampleRate < 8000 || audio.length / audio.sampleRate < .08 || audio.numberOfChannels < 1 || audio.numberOfChannels > 2) return null;
  const stride = Math.max(1, Math.floor(audio.sampleRate / 8000)), rate = audio.sampleRate / stride;
  const size = Math.min(2048, Math.floor(audio.length / stride)), span = size * stride;
  const radius = stride * 12, cutoff = .42 / stride;
  const kernel = Array.from({ length: radius * 2 + 1 }, (_, k) => {
    const x = k - radius;
    return (x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x)) * (.5 + .5 * Math.cos(Math.PI * x / radius));
  });
  const weight = kernel.reduce((a, b) => a + b, 0);
  const frames: { frequency: number | null; energy: number }[] = [];
  const windows = Math.min(16, Math.max(1, Math.ceil(audio.length / span * 2)));
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const input = audio.getChannelData(channel);
    for (let w = 0; w < windows; w++) {
      const start = Math.floor((audio.length - span) * (windows === 1 ? 0 : w / (windows - 1)));
      const samples = new Float32Array(size); let energy = 0;
      for (let i = 0; i < size; i++) {
        const position = start + i * stride; let value = 0;
        for (let k = 0; k < kernel.length; k++) value += input[Math.max(0, Math.min(input.length - 1, position + k - radius))] * kernel[k];
        samples[i] = value / weight; energy += samples[i] ** 2 / size;
      }
      frames.push({ frequency: framePitch(samples, rate), energy });
    }
  }
  const peakEnergy = Math.max(...frames.map(f => f.energy));
  const audible = frames.filter(f => f.energy > Math.max(1e-8, peakEnergy * .001));
  const pitched = audible.filter((f): f is { frequency: number; energy: number } => f.frequency !== null);
  if (!pitched.length || pitched.length < audible.length * .65) return null;
  const centsApart = (a: number, b: number) => Math.abs(1200 * Math.log2(a / b));
  const clusters = pitched.map(f => pitched.filter(other => centsApart(f.frequency, other.frequency) < 35));
  const stable = clusters.sort((a, b) => b.length - a.length)[0];
  if (stable.length < pitched.length * .7) return null;
  const frequencies = stable.map(f => f.frequency).sort((a, b) => a - b);
  return tuningFor(frequencies[Math.floor(frequencies.length / 2)]);
}

export function tunedFrameCount(audio: Pick<PcmAudio, 'length' | 'numberOfChannels'>, ratio: number) {
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error('Invalid tuning.');
  const frames = Math.ceil(audio.length / ratio);
  if (frames < 1 || 44 + frames * audio.numberOfChannels * 2 > 10_000_000) throw new Error('The tuned WAV exceeds 10 MB. Crop the sound first.');
  return frames;
}
