import { scrypt, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

// OWASP's memory/CPU balanced scrypt configuration: N=2^14, r=8, p=5.
// The account actor serializes password work to keep memory usage bounded.
export function derivePassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key.toString('hex'));
    });
  });
}

export async function verifyPassword(password: string, salt: string, expected: string): Promise<boolean> {
  const actual = Buffer.from(await derivePassword(password, salt), 'hex');
  const known = Buffer.from(expected, 'hex');
  return actual.length === known.length && timingSafeEqual(actual, known);
}
