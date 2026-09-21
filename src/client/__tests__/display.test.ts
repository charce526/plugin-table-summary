import { describe, expect, it } from 'vitest';
import { normalizePrecision, resolveFractionDigits } from '../../shared/display';

describe('summary precision', () => {
  it('caps invalid saved precision and reads exponent steps', () => {
    expect(normalizePrecision(999)).toBe(20);
    expect(normalizePrecision(-1)).toBe(undefined);
    expect(resolveFractionDigits(undefined, undefined, 0.0000001)).toBe(7);
    expect(resolveFractionDigits(2, 4, 0.001)).toBe(2);
  });
});
