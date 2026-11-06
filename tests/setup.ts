import { webcrypto } from 'node:crypto';

const g = globalThis as typeof globalThis & { crypto?: Crypto };
if (!g.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}
