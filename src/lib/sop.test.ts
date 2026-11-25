import { describe, it, expect } from 'vitest';
import { renderSop, speedLevel, resolveSop } from './sop';

describe('sop', () => {
  it('fills fields regardless of accents/case', () => {
    expect(renderSop('Salam {Prénom}, {lien visio}', { prenom: 'Ali', 'Lien Visio': 'https://m' })).toBe('Salam Ali, https://m');
  });
  it('keeps unknown fields visible', () => {
    expect(renderSop('{Heure}', {})).toBe('{Heure}');
  });
  it('speed: <10 green, 10-15 orange, >=15 red by default', () => {
    const c = resolveSop({});
    expect(speedLevel(9, c)).toBe('green');
    expect(speedLevel(12, c)).toBe('orange');
    expect(speedLevel(15, c)).toBe('red');
  });
});
