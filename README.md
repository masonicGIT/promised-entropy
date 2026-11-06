# promised-entropy

Harvests organic entropy (CPU timing + event-loop jitter), expands it via SHA-256/HKDF, and mixes the result with the platform CSPRNG to produce cryptographically strong random bytes.

## What it does

`promised-entropy` collects non-deterministic system noise and processes it into a secure random stream.

*   **Sources**: CPU timing races (floating-point operation counts) and event-loop jitter (`setTimeout`/`performance.now` deltas).
*   **Processing**: Samples are packed, hashed with SHA-256, and expanded using HKDF-SHA-256 (with a counter-mode fallback).
*   **Mixing**: The expanded output is XORed with fresh bytes from `crypto.getRandomValues` (Web Crypto API).
*   **Safety**: Guarantees output never relies solely on timing noise and prevents repeated 32-byte hash blocks in long outputs.

## Install

Requires Node.js >= 18 (for native Web Crypto API) or a modern browser environment.

```bash
npm install promised-entropy
```

## Usage

### ESM (Node.js / Browser)

```javascript
import { promisedEntropy } from 'promised-entropy';

// Generate 256 bits (32 bytes) of entropy
const randomBytes = await promisedEntropy(256);

console.log(randomBytes instanceof Uint8Array); // true
console.log(randomBytes.length); // 32
```

### CJS (Node.js)

```javascript
const { promisedEntropy } = require('promised-entropy');

(async () => {
  // Generate 512 bits (64 bytes) of entropy
  const randomBytes = await promisedEntropy(512);

  console.log(randomBytes instanceof Uint8Array); // true
})();
```

## Entropy Design

The library operates on the principle that organic entropy sources are noisy and biased. It mitigates this through:

1.  **Harvesting**: Continuous background loops measure CPU work duration and event-loop wake-up delays.
2.  **Expansion**: Raw integer deltas are hashed (SHA-256) and expanded using HKDF to ensure uniform distribution.
3.  **Mixing**: The derived entropy is XORed with data from the platform's CSPRNG (`crypto.getRandomValues`). This ensures that even if timing sources are compromised, the output remains secure.
4.  **Uniqueness**: Expansion uses HKDF (or counter-mode SHA-256), so long outputs never repeat a single 32-byte digest.

## API

### `promisedEntropy(bits, options?)`

Asynchronously generates a `Promise<Uint8Array>` containing cryptographically mixed bytes.

*   `bits` (`number`): Desired strength in bits. Output length is `ceil(bits / 8)`.
*   `options` (`EntropyOptions`, optional): Harvester tuning parameters.

**Returns**: `Promise<Uint8Array>`

### `Generator`

A class for low-level control over the entropy harvesting process.

```typescript
const generator = new Generator({ loopDelay: 10 });
const samples = await generator.collect(256); // Returns raw integer deltas
```

*   `collect(bitsWanted: number)`: Collects raw samples until the estimated bit total is reached. Returns `Promise<number[]>`.
*   `countUnusedBits()`: Returns the estimated unused bits currently buffered.
*   `stop()` / `resume()`: Manually control the background harvesting loop.

### `EntropyOptions`

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `loopDelay` | `number` | `5` | Milliseconds to pause between loops while a collect/generate is in flight. |
| `lazyLoopDelay` | `number` | `30` | Milliseconds to pause between loops while idle. |
| `workMin` | `number` | `1` | Target milliseconds of CPU work per timing sample. |
| `autoStopBits` | `number` | `4096` | Stop harvesting once this many unclaimed estimated bits are buffered. |
| `maxBitsPerDelta` | `number` | `4` | Cap estimated entropy bits claimed per delta. |
| `autoStop` | `boolean` | `true` | Stop the background loop after collect finishes. |

## Breaking Changes from v0.x

*   **Return Type**: `promisedEntropy` now returns a `Uint8Array` instead of a `number[]`.
*   **Raw Samples**: To access raw timing deltas, use `new Generator().collect(bits)` instead of the main function.
*   **Dependencies**: Removed dependencies on `bluebird` and `iced`. Requires native `async/await`.
*   **Runtime**: Requires Node.js >= 18 (or equivalent Web Crypto support).

## License

MIT. Forked from `keybase/more-entropy`.
