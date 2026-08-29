import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const SESSION_TOKEN_BYTES = 32; // 256 bits

/**
 * Generate a cryptographically random session token (≥128 bits).
 * Returned as a hex string.
 */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('hex');
}

/**
 * Resolve the state directory for the desktop console.
 * ~/.agent-task-loop/desktop/
 */
export function stateDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '.';
  return join(home, '.agent-task-loop', 'desktop');
}

/**
 * Resolve the session token file path.
 */
export function tokenFilePath(): string {
  return join(stateDir(), 'session-token');
}

/**
 * Load the session token from the state file, or generate + persist one.
 * The file is created with mode 0600 (owner read/write only).
 */
export function loadOrCreateToken(): string {
  const filePath = tokenFilePath();
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf8').trim();
    if (existing) return existing;
  }
  const token = generateSessionToken();
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, token, { mode: 0o600 });
  return token;
}

/**
 * Parse and validate the Authorization header.
 * Returns the token if valid, or null if missing/invalid.
 */
export function parseBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) return null;
  return match[1]!.trim() || null;
}

/**
 * Constant-time token comparison to avoid timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i]! ^ bufB[i]!;
  }
  return diff === 0;
}
