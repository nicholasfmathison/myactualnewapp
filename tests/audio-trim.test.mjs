import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { millisecondLevels, waveformEnvelope, toDb, trimFrames, trimToWav, wavSize } from '../src/lib/audio-trim.ts';
const requireBackend = createRequire(new URL('../functions/package.json', import.meta.url));
const { parseBuffer } = await import(pathToFileURL(requireBackend.resolve('music-metadata')).href);
const pcm = (sampleRate, ...channels) => ({ sampleRate, length: channels[0].length, numberOfChannels: channels.length, getChannelData: c => channels[c] });

test('silence, half-scale and opposite-phase stereo have correct 1 ms RMS and peak', () => {
  const left = new Float32Array(144); left.fill(.5, 48, 96); left.fill(-1, 96);
  const right = Float32Array.from(left, v => -v);
  const levels = millisecondLevels(pcm(48000, left, right));
  assert.equal(levels.length, 3); assert.equal(toDb(levels[0].rms), -Infinity);
  assert.ok(Math.abs(toDb(levels[1].rms) + 6.0206) < .0001);
  assert.equal(levels[2].peak, 1); assert.equal(levels[2].rms, 1);
  assert.equal(levels[2].min, -1); assert.equal(levels[2].max, 1);
});
test('44.1 kHz bins retain the last partial millisecond and its transient', () => {
  const samples = new Float32Array(100); samples[99] = 1;
  const levels = millisecondLevels(pcm(44100, samples));
  assert.equal(levels.length, 3); assert.equal(levels[2].peak, 1);
  assert.ok(Math.abs(levels[2].rms - Math.sqrt(1 / 12)) < 1e-10);
});
test('cropped WAV decodes with the exact selected duration, rate and channel count', async () => {
  const samples = Float32Array.from({ length: 48000 }, (_, i) => .5 * Math.sin(2 * Math.PI * 440 * i / 48000));
  const original = samples.slice(); const audio = pcm(48000, samples, samples);
  const wav = trimToWav(audio, .125, .875);
  const { format } = await parseBuffer(Buffer.from(wav), { mimeType: 'audio/wav' });
  assert.equal(format.duration, .75); assert.equal(format.sampleRate, 48000);
  assert.equal(format.numberOfChannels, 2); assert.equal(format.bitsPerSample, 16);
  assert.equal(wav.byteLength, 44 + 36000 * 4); assert.deepEqual(samples, original);
});
test('crop uses inclusive start/exclusive end and preserves stereo ordering', () => {
  const audio = pcm(1000, Float32Array.from([0, -.5, .5, 1]), Float32Array.from([0, .25, -.25, -1]));
  const view = new DataView(trimToWav(audio, .001, .003));
  assert.deepEqual([44, 46, 48, 50].map(n => view.getInt16(n, true)), [-16384, 8192, 16384, -8192]);
});
test('fractional boundaries snap to the nearest sample without adding duration', () => {
  const audio = pcm(44100, new Float32Array(441));
  assert.deepEqual(trimFrames(audio, .001, .009), { first: 44, last: 397, count: 353 });
  assert.equal(wavSize(audio, 0, .01), 926);
});
test('empty, backwards, nonfinite and out-of-bounds trims are rejected', () => {
  const audio = pcm(48000, new Float32Array(480));
  for (const [start, end] of [[0, 0], [.01, .001], [-1, .01], [0, 1], [NaN, .01], [0, Infinity], [0, 1e-10]]) {
    assert.throws(() => trimToWav(audio, start, end));
  }
});
test('export rejects WAVs larger than the API limit before allocating output', () => {
  const fake = { sampleRate: 48000, numberOfChannels: 2, length: 48000 * 60, getChannelData() { throw new Error('should not access data'); } };
  assert.throws(() => trimToWav(fake, 0, 60), /exceed 10 MB/);
});

test('waveform retains single-sample transients when zoomed out', () => {
  const samples = new Float32Array(48000); samples[19219] = .875; samples[19220] = -1;
  const envelope = waveformEnvelope(pcm(48000, samples), 0, 1, 100);
  assert.equal(envelope.length, 100);
  assert.equal(Math.max(...envelope.map(p => p.max)), .875);
  assert.equal(Math.min(...envelope.map(p => p.min)), -1);
});
test('waveform shows actual signed samples at close zoom and excludes outside samples', () => {
  const audio = pcm(1000, Float32Array.from([1, .5, -.25, .75, -.5, -1]));
  const envelope = waveformEnvelope(audio, .001, .005, 100);
  assert.deepEqual(envelope.map(p => [p.min, p.max]), [[.5, .5], [-.25, -.25], [.75, .75], [-.5, -.5]]);
});
test('waveform combines stereo extrema without cancelling opposite-phase samples', () => {
  const audio = pcm(1000, Float32Array.from([.5, .25]), Float32Array.from([-.5, -.25]));
  assert.deepEqual(waveformEnvelope(audio, 0, .002, 2).map(p => [p.min, p.max]), [[-.5, .5], [-.25, .25]]);
});
