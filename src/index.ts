import { deriveOutput } from './crypto.js';
import { Generator, type EntropyOptions } from './generator.js';

export { Generator, type EntropyOptions };
export { deriveOutput, expandBytes, hasRepeated32ByteBlocks, packSamples, sha256 } from './crypto.js';

/**
 * Harvest organic entropy (CPU timing + event-loop jitter), hash/expand it,
 * and mix with the platform CSPRNG.
 *
 * @param bits - Desired strength in bits. Output length is `ceil(bits / 8)` bytes.
 * @param options - Optional harvester tuning (same knobs as classic more-entropy).
 * @returns A `Uint8Array` of cryptographically mixed bytes (never a repeated 32-byte digest).
 *
 * **Breaking change from 0.x:** returns `Uint8Array` instead of `number[]` raw deltas.
 * Use `new Generator(options).collect(bits)` if you need the raw samples.
 */
export async function promisedEntropy(
  bits: number,
  options?: EntropyOptions,
): Promise<Uint8Array> {
  if (!bits) {
    throw new Error('Please specify how many bits of combined entropy you would like');
  }
  if (!Number.isFinite(bits) || bits <= 0) {
    throw new Error('bits must be a positive number');
  }

  const byteLength = Math.ceil(bits / 8);
  const generator = new Generator(options ?? {});
  const samples = await generator.collect(bits);
  return deriveOutput(samples, byteLength);
}

