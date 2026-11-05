import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch, tuningFor, tunedFrameCount } from '../src/lib/pitch.ts';
const pcm = (rate, ...channels) => ({ sampleRate: rate, length: channels[0].length, numberOfChannels: channels.length, getChannelData: c => channels[c] });
const tone = (hz, rate = 44100, seconds = 1, shape = phase => Math.sin(phase)) => Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => .3 * shape(2 * Math.PI * hz * i / rate));
const near = (actual, expected, cents = 3) => assert.ok(Math.abs(1200 * Math.log2(actual / expected)) < cents, `${actual} Hz vs ${expected} Hz`);

test('detects low bass, detuned notes and high single notes at common sample rates', () => {
  for (const rate of [44100, 48000, 96000]) for (const hz of [30, 65.4064, 73.9, 440, 987.77]) {
    const result = detectPitch(pcm(rate, tone(hz, rate)));
    assert.ok(result, `${hz} Hz at ${rate}`); near(result.frequency, hz);
  }
});
test('finds the fundamental beneath stronger harmonics and opposite-phase stereo', () => {
  const left = tone(110, 44100, 1, p => .25 * Math.sin(p) + Math.sin(2 * p) + .4 * Math.sin(3 * p));
  const original = left.slice();
  const result = detectPitch(pcm(44100, left, Float32Array.from(left, x => -x)));
  assert.ok(result); near(result.frequency, 110); assert.deepEqual(left, original);
});
test('stable bass tail survives an initial pitch drop and decaying volume', () => {
  let phase = 0;
  const samples = Float32Array.from({ length: 44100 }, (_, i) => {
    const t = i / 44100; phase += 2 * Math.PI * (65.4064 + 80 * Math.exp(-t * 50)) / 44100;
    return .7 * Math.exp(-t * 3) * Math.sin(phase);
  });
  const result = detectPitch(pcm(44100, samples)); assert.ok(result); near(result.frequency, 65.4064, 6);
});
test('silence, DC, short clicks, noise, changing notes and competing stereo notes are inconclusive', () => {
  let seed = 17; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const noise = Float32Array.from({ length: 44100 }, () => random() - .5);
  const melody = Float32Array.from({ length: 44100 }, (_, i) => .3 * Math.sin(2 * Math.PI * (i < 22050 ? 220 : 440) * i / 44100));
  for (const samples of [new Float32Array(44100), new Float32Array(44100).fill(.3), tone(440, 44100, .02), noise, melody]) assert.equal(detectPitch(pcm(44100, samples)), null);
  assert.equal(detectPitch(pcm(44100, tone(220), tone(277.18))), null);
});
test('nearest C includes fractional tuning and sampler duration changes in either direction', () => {
  const up = tuningFor(440); assert.equal(up.note, 'A4'); assert.equal(up.targetNote, 'C5'); near(up.target, 523.2511306);
  assert.ok(Math.abs(up.cents - 300) < 1e-8);
  const down = tuningFor(73.9); assert.equal(down.targetNote, 'C2'); assert.ok(down.ratio < 1);
  assert.equal(tunedFrameCount({ length: 44100, numberOfChannels: 2 }, up.ratio), Math.ceil(44100 / up.ratio));
  assert.ok(tunedFrameCount({ length: 44100, numberOfChannels: 1 }, down.ratio) > 44100);
  assert.ok(Math.abs(tuningFor(261.6255653).cents) < .001);
});
test('rejects oversized render before allocation and invalid ratios', () => {
  assert.throws(() => tunedFrameCount({ length: 2_000_000, numberOfChannels: 2 }, .7), /10 MB/);
  for (const ratio of [0, -1, NaN, Infinity]) assert.throws(() => tunedFrameCount({ length: 100, numberOfChannels: 1 }, ratio));
});
