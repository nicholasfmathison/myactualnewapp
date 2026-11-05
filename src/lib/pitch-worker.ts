import { detectPitch } from './pitch';

self.onmessage = (event: MessageEvent<{ channels: Float32Array[]; sampleRate: number }>) => {
  try {
    const { channels, sampleRate } = event.data;
    const tuning = detectPitch({ sampleRate, length: channels[0].length, numberOfChannels: channels.length, getChannelData: c => channels[c] });
    self.postMessage({ tuning });
  } catch { self.postMessage({ error: 'Could not analyze this sound.' }); }
};
