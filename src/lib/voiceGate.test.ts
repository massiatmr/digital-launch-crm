import { describe, it, expect } from 'vitest';
import { isVoiceFrame } from './voiceGate';

describe('voice gate', () => {
  it('keeps loud speech', () => expect(isVoiceFrame(0.1, 0.2)).toBe(true));
  it('drops silence', () => expect(isVoiceFrame(0.005, 0.1)).toBe(false));
  it('drops ringing tone', () => expect(isVoiceFrame(0.2, 0.9)).toBe(false));
});
