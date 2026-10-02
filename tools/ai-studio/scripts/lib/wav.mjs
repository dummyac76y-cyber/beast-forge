// Minimal dependency-free WAV encoder (16-bit signed PCM).
//
// The web build fetches manifest audio as raw bytes during page load and calls
// AudioContext.decodeAudioData() only after a user gesture (web/js/assets.js).
// decodeAudioData handles RIFF/WAVE natively in every browser Kilo targets, so
// no encoder dependency is needed. Output is mono 22050 Hz, which keeps the
// short gameplay cues small enough to live in the repository.
export const SAMPLE_RATE = 22050;

export function encodeWAV(samples, sampleRate = SAMPLE_RATE) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);

  buf.write('RIFF', 0, 'latin1');
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8, 'latin1');
  buf.write('fmt ', 12, 'latin1');
  buf.writeUInt32LE(16, 16);            // PCM chunk size
  buf.writeUInt16LE(1, 20);             // format = PCM
  buf.writeUInt16LE(1, 22);             // channels = mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32);             // block align
  buf.writeUInt16LE(16, 34);            // bits per sample
  buf.write('data', 36, 'latin1');
  buf.writeUInt32LE(n * 2, 40);

  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

/** Structural WAV check used by the verifier. */
export function readWAVHeader(buf) {
  if (buf.toString('latin1', 0, 4) !== 'RIFF') return null;
  if (buf.toString('latin1', 8, 12) !== 'WAVE') return null;
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  const dataLen = buf.readUInt32LE(40);
  const frames = dataLen / (channels * (bits / 8));
  return { channels, sampleRate, bits, durationSec: frames / sampleRate };
}