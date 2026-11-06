import { describe, expect, it } from 'vitest';
import { Generator } from '../src/index.js';

describe('Generator CPU timing loop', () => {
  it('millisecondCount returns a positive integer', () => {
    const g = new Generator({ autoStop: true });
    g.stop();
    const n = g.millisecondCount();
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThan(0);
  });

  it('collect returns raw integer samples covering the requested bits', async () => {
    const g = new Generator({
      loopDelay: 2,
      lazyLoopDelay: 2,
      workMin: 1,
      maxBitsPerDelta: 4,
      autoStop: true,
    });
    const samples = await g.collect(32);
    expect(Array.isArray(samples)).toBe(true);
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      expect(Number.isFinite(s)).toBe(true);
      expect(Number.isInteger(s)).toBe(true);
    }
  });

  it('consecutive collect calls yield different sample sequences', async () => {
    const opts = {
      loopDelay: 2,
      lazyLoopDelay: 2,
      workMin: 1,
      maxBitsPerDelta: 4,
      autoStop: true as const,
    };
    const a = await new Generator(opts).collect(24);
    const b = await new Generator(opts).collect(24);
    // Extremely unlikely to be identical given timing noise; allow length mismatch.
    const same =
      a.length === b.length && a.every((v, i) => v === b[i]);
    expect(same).toBe(false);
  });
});
