import { Mp3Encoder } from '@breezystack/lamejs';
export function wav(frequency = 440, seconds = .25) {
  const rate = 44100; const frames = Math.floor(rate * seconds); const buffer = Buffer.alloc(44 + frames * 2);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) buffer.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * i / rate) * 8192), 44 + i * 2);
  return buffer;
}
export function mp3() {
  const encoder = new Mp3Encoder(1, 44100, 128); const pcm = wav();
  const samples = new Int16Array(pcm.buffer.slice(pcm.byteOffset + 44, pcm.byteOffset + pcm.length));
  const chunks: Buffer[] = [];
  for (let i = 0; i < samples.length; i += 1152) chunks.push(Buffer.from(encoder.encodeBuffer(samples.subarray(i, i + 1152))));
  chunks.push(Buffer.from(encoder.flush())); return Buffer.concat(chunks);
}
