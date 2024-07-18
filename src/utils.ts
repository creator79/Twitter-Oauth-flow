// utils.ts
import crypto from 'crypto';

/**
 * Generates a nonce.
 * @param length - The length of the nonce.
 * @returns A nonce string.
 */
export function generateNonce(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Generates a timestamp.
 * @returns A timestamp string.
 */
export function generateTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

/**
 * Percent encodes a string.
 * @param str - The string to be encoded.
 * @returns The encoded string.
 */
export function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\*/g, '%2A')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

/**
 * Creates an HMAC-SHA1 signature.
 * @param baseString - The base string.
 * @param key - The signing key.
 * @returns The HMAC-SHA1 signature.
 */
export function hmacSha1(baseString: string, key: string): string {
  return crypto.createHmac('sha1', key).update(baseString).digest('base64');
}
