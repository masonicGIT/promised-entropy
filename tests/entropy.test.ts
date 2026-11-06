import { describe, expect, it } from 'vitest';
import {
  expandBytes,
  hasRepeated32ByteBlocks,
  promisedEntropy,
  sha256,
} from '../src/index.js';

describe('promisedEntropy', () => {
  it('rejects missing or non-positive bits', async () => {
    await expect(promisedEntropy(0)).rejects.toThrow(/bits/i);
    await expect(promisedEntropy(-1)).rejects.toThrow(/bits/i);
  });

  it('returns a Uint8Array of the correct byte length', async () => {
    const out = await promisedEntropy(256);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.byteLength).toBe(32);
  });

  it('rounds odd bit counts up to whole bytes', async () => {
    const out = await promisedEntropy(7);
    expect(out.byteLength).toBe(1);
  });

  it('produces different outputs on consecutive calls', async () => {
    const a = await promisedEntropy(128);
    const b = await promisedEntropy(128);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('completes a 256-bit request in a reasonable time', async () => {
    const started = Date.now();
    await promisedEntropy(256, { loopDelay: 2, workMin: 1 });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(30_000);
  });

  it('accepts classic tuning options', async () => {
    const out = await promisedEntropy(64, {
      loopDelay: 5,
      workMin: 1,
      autoStopBits: 512,
      maxBitsPerDelta: 4,
    });
    expect(out.byteLength).toBe(8);
  });
});

describe('long outputs (>32 bytes)', () => {
  it('does not repeat the first 32-byte block', async () => {
    const out = await promisedEntropy(512); // 64 bytes
    expect(out.byteLength).toBe(64);
    expect(hasRepeated32ByteBlocks(out)).toBe(false);
  });

  it('HKDF/counter expansion never repeats a digest block', async () => {
    const ikm = await sha256(new TextEncoder().encode('test-ikm'));
    const salt = new Uint8Array(32);
    salt[0] = 1;
    const expanded = await expandBytes(ikm, 96, salt);
    expect(expanded.byteLength).toBe(96);
    expect(hasRepeated32ByteBlocks(expanded)).toBe(false);
    // Adjacent 32-byte windows should also differ from the first block.
    expect(Buffer.from(expanded.subarray(0, 32)).equals(Buffer.from(expanded.subarray(32, 64)))).toBe(
      false,
    );
    expect(Buffer.from(expanded.subarray(0, 32)).equals(Buffer.from(expanded.subarray(64, 96)))).toBe(
      false,
    );
  });
});
