/**
 * Hash and expand harvested timing samples into output bytes, mixed with the
 * platform CSPRNG so output never depends solely on timing noise.
 */

function getCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c?.subtle || typeof c.getRandomValues !== 'function') {
    throw new Error(
      'Web Crypto (globalThis.crypto.subtle + getRandomValues) is required; use Node.js >= 18 or a modern browser',
    );
  }
  return c;
}

/** Ensure a Uint8Array backed by a plain ArrayBuffer for Web Crypto typings. */
function asBufferSource(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy;
}

/** Pack signed integer samples into little-endian Int32 bytes. */
export function packSamples(samples: number[]): Uint8Array {
  const out = new Uint8Array(samples.length * 4);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) {
    view.setInt32(i * 4, samples[i]!, true);
  }
  return out;
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await getCrypto().subtle.digest('SHA-256', asBufferSource(data));
  return new Uint8Array(digest);
}

/**
 * HKDF-SHA-256 expand: derive `length` bytes from IKM with the given salt/info.
 * Falls back to counter-mode SHA-256 if HKDF is unavailable (should not happen
 * on Node >= 18 / modern browsers).
 */
export async function expandBytes(
  ikm: Uint8Array,
  length: number,
  salt: Uint8Array,
  infoLabel = 'promised-entropy/v1',
): Promise<Uint8Array> {
  if (length <= 0) {
    throw new Error('length must be positive');
  }
  const crypto = getCrypto();
  const info = new TextEncoder().encode(infoLabel);

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      asBufferSource(ikm),
      'HKDF',
      false,
      ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: asBufferSource(salt),
        info: asBufferSource(info),
      },
      key,
      length * 8,
    );
    return new Uint8Array(bits);
  } catch {
    // Counter-mode SHA-256 expansion (never repeats a single digest).
    return counterModeSha256(ikm, salt, info, length);
  }
}

async function counterModeSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const out = new Uint8Array(length);
  let offset = 0;
  let counter = 1;
  while (offset < length) {
    const block = new Uint8Array(4 + ikm.length + salt.length + info.length);
    const view = new DataView(block.buffer);
    view.setUint32(0, counter, false);
    block.set(ikm, 4);
    block.set(salt, 4 + ikm.length);
    block.set(info, 4 + ikm.length + salt.length);
    const digest = await sha256(block);
    const take = Math.min(digest.length, length - offset);
    out.set(digest.subarray(0, take), offset);
    offset += take;
    counter += 1;
  }
  return out;
}

/** XOR two equal-length byte arrays in place into `a`. */
export function xorInPlace(a: Uint8Array, b: Uint8Array): void {
  if (a.length !== b.length) {
    throw new Error('xorInPlace length mismatch');
  }
  for (let i = 0; i < a.length; i++) {
    a[i] = (a[i]! ^ b[i]!) & 0xff;
  }
}

/**
 * Turn raw timing samples into `byteLength` output bytes:
 * 1) SHA-256 the packed samples as IKM material
 * 2) draw CSPRNG salt + mixing bytes via getRandomValues
 * 3) HKDF-expand to the requested length
 * 4) XOR with fresh getRandomValues so output never depends only on timing
 */
export async function deriveOutput(
  samples: number[],
  byteLength: number,
): Promise<Uint8Array> {
  if (samples.length === 0) {
    throw new Error('need at least one sample');
  }
  if (byteLength <= 0) {
    throw new Error('byteLength must be positive');
  }

  const crypto = getCrypto();
  const packed = packSamples(samples);
  const ikm = await sha256(packed);

  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);

  const expanded = await expandBytes(ikm, byteLength, salt);

  const mixer = new Uint8Array(byteLength);
  crypto.getRandomValues(mixer);
  xorInPlace(expanded, mixer);

  return expanded;
}

/** True if `bytes` contains a repeated 32-byte block (bad expansion). */
export function hasRepeated32ByteBlocks(bytes: Uint8Array): boolean {
  if (bytes.length <= 32) return false;
  const first = bytes.subarray(0, 32);
  for (let offset = 32; offset + 32 <= bytes.length; offset += 32) {
    const block = bytes.subarray(offset, offset + 32);
    let same = true;
    for (let i = 0; i < 32; i++) {
      if (first[i] !== block[i]) {
        same = false;
        break;
      }
    }
    if (same) return true;
  }
  return false;
}
