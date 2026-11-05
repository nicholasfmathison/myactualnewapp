import { trimToWav } from './audio-trim.ts';

export const RECORD_RATE = 48000;
export const MAX_RECORD_FRAMES = Math.floor((10_000_000 - 44) / 2);
interface Callbacks { ready: () => void; progress: (seconds: number) => void; complete: (file: File) => void; error: (message: string) => void }

export class MicrophoneRecorder {
  private context?: AudioContext;
  private stream?: MediaStream;
  private node?: AudioWorkletNode;
  private source?: MediaStreamAudioSourceNode;
  private chunks: Float32Array[] = [];
  private frames = 0;
  private disposed = false;
  private callbacks: Callbacks;
  constructor(callbacks: Callbacks) { this.callbacks = callbacks; }
  async start() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Recording needs microphone support on localhost or HTTPS. You can still import audio.');
      this.context = new AudioContext({ sampleRate: RECORD_RATE });
      // Unlock playback while the click still carries user activation (including Safari).
      const resumed = this.context.resume().then(() => null, error => error);
      // Start permission request only in response to the Record button.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (this.disposed) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const resumeError = await resumed;
      if (resumeError) throw resumeError;
      if (this.disposed) return;
      await this.context.audioWorklet.addModule(new URL('./record-worklet.js', import.meta.url));
      if (this.disposed) return;
      this.node = new AudioWorkletNode(this.context, 'soundroom-capture', { channelCount: 1, channelCountMode: 'explicit', numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { maxFrames: MAX_RECORD_FRAMES } });
      this.node.onprocessorerror = () => this.fail('Recording stopped unexpectedly. Please try again.');
      this.node.port.onmessage = (event: MessageEvent<{ type: string; data: Float32Array }>) => {
        if (this.disposed) return;
        if (event.data.type === 'samples') {
          this.chunks.push(event.data.data); this.frames += event.data.data.length;
          this.callbacks.progress(this.frames / this.context!.sampleRate);
        } else if (event.data.type === 'done') this.finish();
      };
      this.source = this.context.createMediaStreamSource(stream);
      this.source.connect(this.node); this.node.connect(this.context.destination);
      stream.getAudioTracks().forEach(track => { track.onended = () => this.stop(); });
      this.callbacks.ready();
    } catch (error) {
      if (this.disposed) return;
      const name = error instanceof Error ? error.name : '';
      this.fail(name === 'NotAllowedError' ? 'Microphone access was denied. Allow it in your browser, or import a sound.' : name === 'NotFoundError' ? 'No microphone found. Connect one, or import a sound.' : name === 'NotReadableError' ? 'The microphone is unavailable. Check whether another app is using it.' : error instanceof Error ? error.message : 'Recording could not start. Please try again.');
    }
  }
  stop() { if (!this.disposed) this.node?.port.postMessage({ type: 'stop' }); }
  private finish() {
    const rate = this.context!.sampleRate;
    if (!this.frames) { this.fail('No audio was captured. Try recording again.'); return; }
    try {
      const samples = new Float32Array(this.frames); let offset = 0;
      for (const chunk of this.chunks) { samples.set(chunk, offset); offset += chunk.length; }
      const wav = trimToWav({ sampleRate: rate, length: samples.length, numberOfChannels: 1, getChannelData: () => samples }, 0, samples.length / rate);
      this.dispose();
      this.callbacks.complete(new File([wav], 'recording.wav', { type: 'audio/wav' }));
    } catch { this.fail('Could not prepare this recording. Please try again.'); }
  }
  private fail(message: string) { this.dispose(); this.callbacks.error(message); }
  dispose() {
    this.disposed = true;
    if (this.node) { this.node.onprocessorerror = null; this.node.port.onmessage = null; this.node.port.close(); this.node.disconnect(); }
    this.source?.disconnect();
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
    this.chunks = [];
  }
}
