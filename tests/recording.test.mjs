import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { MicrophoneRecorder, MAX_RECORD_FRAMES } from '../src/lib/recorder.ts';

const code = await readFile(new URL('../src/lib/record-worklet.js', import.meta.url), 'utf8');
function processor(limit = MAX_RECORD_FRAMES) {
  let Processor; const messages = [];
  vm.runInNewContext(code, { Float32Array, AudioWorkletProcessor: class { port = { postMessage: value => messages.push(value) }; }, registerProcessor: (_name, implementation) => { Processor = implementation; } });
  return { node: new Processor({ processorOptions: { maxFrames: limit } }), messages };
}
test('recording preserves samples across chunks and flushes the final partial block exactly once', () => {
  const { node, messages } = processor();
  const input = Float32Array.from({ length: 4500 }, (_, i) => .3 * Math.sin(i / 10));
  for (let i = 0; i < input.length; i += 128) node.process([[input.slice(i, i + 128)]]);
  node.port.onmessage({ data: { type: 'stop' } }); node.port.onmessage({ data: { type: 'stop' } });
  assert.equal(messages.filter(m => m.type === 'done').length, 1);
  assert.deepEqual(messages.filter(m => m.type === 'samples').map(m => m.data.length), [4096, 404]);
  assert.deepEqual(Float32Array.from(messages.filter(m => m.type === 'samples').flatMap(m => [...m.data])), input);
  assert.equal(node.process([[input]]), false);
});
test('audio-thread limit stops at the exact frame, even inside a render block', () => {
  const { node, messages } = processor(5000);
  for (let i = 0; i < 50; i++) node.process([[new Float32Array(128).fill(.25)]]);
  assert.equal(messages.filter(m => m.type === 'samples').reduce((n, m) => n + m.data.length, 0), 5000);
  assert.equal(messages.filter(m => m.type === 'done').length, 1);
  assert.ok(44 + MAX_RECORD_FRAMES * 2 <= 10_000_000);
});
test('absent input does not produce fake captured samples', () => {
  const { node, messages } = processor(); assert.equal(node.process([[]]), true);
  node.port.onmessage({ data: { type: 'stop' } }); assert.deepEqual(messages.map(message => message.type), ['done']);
});

test('closing while permission is pending stops any late microphone stream', async t => {
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator'); const oldContext = globalThis.AudioContext;
  let resolveStream; let stopped = 0; let closed = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => new Promise(resolve => { resolveStream = resolve; }) } } });
  globalThis.AudioContext = class { state = 'running'; resume() { return Promise.resolve(); } close() { closed++; this.state = 'closed'; return Promise.resolve(); } };
  t.after(() => { if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete globalThis.navigator; globalThis.AudioContext = oldContext; });
  const recorder = new MicrophoneRecorder({ ready: () => assert.fail('must not start'), progress: () => {}, complete: () => assert.fail('must not save'), error: () => assert.fail('cancel is not an error') });
  const pending = recorder.start(); recorder.dispose(); resolveStream({ getTracks: () => [{ stop: () => stopped++ }] }); await pending;
  assert.equal(stopped, 1); assert.equal(closed, 1);
});

test('denied microphone permission reports a useful error and releases the audio context', async t => {
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator'); const oldContext = globalThis.AudioContext;
  let closed = 0; let message = '';
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => { throw new DOMException('denied', 'NotAllowedError'); } } } });
  globalThis.AudioContext = class { state = 'running'; resume() { return Promise.resolve(); } close() { closed++; this.state = 'closed'; return Promise.resolve(); } };
  t.after(() => { if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete globalThis.navigator; globalThis.AudioContext = oldContext; });
  const recorder = new MicrophoneRecorder({ ready: () => assert.fail('must not start'), progress: () => {}, complete: () => assert.fail('must not save'), error: value => { message = value; } });
  await recorder.start(); assert.match(message, /denied/); assert.equal(closed, 1);
});
