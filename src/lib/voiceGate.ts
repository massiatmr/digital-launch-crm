// Détection simple de voix : énergie suffisante ET pas une tonalité pure (sonnerie ~400-480 Hz).
export const VOICE_RMS_THRESHOLD = 0.02;
export const SILENCE_HANGOVER_MS = 1500;

export function isVoiceFrame(rms: number, toneRatio: number): boolean {
  return rms >= VOICE_RMS_THRESHOLD && toneRatio < 0.6;
}

/** Part d'énergie dans la bande 380-500 Hz (sonnerie / tonalité). */
export function toneBandRatio(freq: Uint8Array, sampleRate: number, fftSize: number): number {
  const hz = sampleRate / fftSize;
  let total = 0, band = 0;
  for (let i = 1; i < freq.length; i++) {
    const v = freq[i] * freq[i];
    total += v;
    const f = i * hz;
    if (f >= 380 && f <= 500) band += v;
  }
  return total ? band / total : 0;
}
