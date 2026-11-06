/**
 * Organic entropy harvester: CPU timing races (millisecond_count) plus
 * event-loop jitter (setTimeout / performance.now deltas).
 */

export interface EntropyOptions {
  /** Milliseconds to pause between loops while a generate() is in flight. Default 5. */
  loopDelay?: number;
  /** Milliseconds to pause between loops while idle. Default 30. */
  lazyLoopDelay?: number;
  /** Target milliseconds of CPU work per timing sample. Default 1. */
  workMin?: number;
  /** Stop harvesting once this many unclaimed estimated bits are buffered. Default 4096. */
  autoStopBits?: number;
  /** Cap estimated entropy bits claimed per delta. Default 4. */
  maxBitsPerDelta?: number;
  /** Stop the background loop after generate() finishes. Default true. */
  autoStop?: boolean;
}

interface Sample {
  value: number;
  bits: number;
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log2(x: number): number {
  return Math.log(x) / Math.LN2;
}

export class Generator {
  readonly loopDelay: number;
  readonly lazyLoopDelay: number;
  readonly workMin: number;
  readonly autoStopBits: number;
  readonly maxBitsPerDelta: number;
  readonly autoStop: boolean;

  private entropies: Sample[] = [];
  private running = false;
  private generating = false;
  private loopPromise: Promise<void> | null = null;
  private lastCpuCount: number | null = null;
  private lastJitterAt: number | null = null;

  constructor(opts: EntropyOptions = {}) {
    this.loopDelay = opts.loopDelay ?? 5;
    this.lazyLoopDelay = opts.lazyLoopDelay ?? 30;
    this.workMin = opts.workMin ?? 1;
    this.autoStopBits = opts.autoStopBits ?? 4096;
    this.maxBitsPerDelta = opts.maxBitsPerDelta ?? 4;
    this.autoStop = opts.autoStop ?? true;
    this.resume();
  }

  /** Estimated unused bits currently buffered. */
  countUnusedBits(): number {
    let bits = 0;
    for (const e of this.entropies) bits += e.bits;
    return bits;
  }

  stop(): void {
    this.running = false;
  }

  resume(): void {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.harvestLoop();
  }

  reset(): void {
    this.entropies = [];
    this.lastCpuCount = null;
    this.lastJitterAt = null;
  }

  /**
   * Collect samples until their estimated bit total reaches `bitsWanted`.
   * Returns the raw signed integer deltas (CPU + jitter).
   */
  async collect(bitsWanted: number): Promise<number[]> {
    if (!Number.isFinite(bitsWanted) || bitsWanted <= 0) {
      throw new Error('bitsWanted must be a positive number');
    }

    this.generating = true;
    if (!this.running) this.resume();

    const out: number[] = [];
    let harvested = 0;

    try {
      while (harvested < bitsWanted) {
        if (this.entropies.length) {
          const e = this.entropies.shift()!;
          harvested += e.bits;
          out.push(e.value);
        } else {
          await sleep(this.loopDelay);
        }
      }
    } finally {
      this.generating = false;
      if (this.autoStop) this.stop();
    }

    return out;
  }

  /** CPU timing race: count floating-point ops that fit in ~workMin ms. */
  millisecondCount(): number {
    const deadline = Date.now() + this.workMin + 1;
    let i = 0;
    let x = 0;
    while (Date.now() < deadline) {
      i++;
      x = Math.sin(Math.sqrt(Math.log(i + x)));
    }
    // Touch x so engines cannot DCE the loop body.
    if (!Number.isFinite(x)) i ^= 1;
    return i;
  }

  private pushDelta(delta: number): void {
    if (!delta) return;
    let entropy = Math.max(0, Math.floor(log2(Math.abs(delta))) - 1);
    entropy = Math.min(this.maxBitsPerDelta, entropy);
    if (entropy <= 0) return;
    this.entropies.push({ value: delta, bits: entropy });
  }

  private async harvestLoop(): Promise<void> {
    while (this.running) {
      if (this.countUnusedBits() < this.autoStopBits) {
        // --- CPU timing sample (analog / organic source Mason wants kept) ---
        const count = this.millisecondCount();
        if (this.lastCpuCount != null) {
          this.pushDelta(count - this.lastCpuCount);
        }
        this.lastCpuCount = count;

        // --- Event-loop jitter sample ---
        const before = nowMs();
        const delay = this.generating ? this.loopDelay : this.lazyLoopDelay;
        await sleep(delay);
        const after = nowMs();
        const elapsed = after - before;
        // Jitter relative to the requested delay, plus successive wake deltas.
        this.pushDelta(Math.round((elapsed - delay) * 1000));
        if (this.lastJitterAt != null) {
          this.pushDelta(Math.round((after - this.lastJitterAt) * 1000));
        }
        this.lastJitterAt = after;
      } else {
        const delay = this.generating ? this.loopDelay : this.lazyLoopDelay;
        await sleep(delay);
      }
    }
  }
}
