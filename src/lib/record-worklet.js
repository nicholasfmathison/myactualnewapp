// Runs on the audio thread. Output stays silent: there is no microphone monitoring.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.limit = options.processorOptions.maxFrames;
    this.frames = 0; this.used = 0; this.chunk = new Float32Array(4096); this.done = false;
    this.port.onmessage = event => { if (event.data.type === 'stop') this.finish(); };
  }
  flush() {
    if (!this.used) return;
    const data = this.chunk.slice(0, this.used);
    this.port.postMessage({ type: 'samples', data }, [data.buffer]); this.used = 0;
  }
  finish() {
    if (this.done) return;
    this.done = true; this.flush(); this.port.postMessage({ type: 'done' });
  }
  process(inputs) {
    if (this.done) return false;
    const samples = inputs[0]?.[0];
    if (!samples) return true;
    for (let i = 0; i < samples.length && this.frames < this.limit; i++) {
      this.chunk[this.used++] = samples[i]; this.frames++;
      if (this.used === this.chunk.length) this.flush();
    }
    if (this.frames >= this.limit) this.finish();
    return !this.done;
  }
}
registerProcessor('soundroom-capture', CaptureProcessor);
