import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';

const BCRYPT_COST_ROUNDS = 12;

function getMasterSecret(): string {
  const envSecret = (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    config.apiKey ||
    'speakly-studio-ephemeral-vault-key'
  ).trim();
  return envSecret;
}

function getEncryptionKey(): Buffer {
  return crypto.createHash('sha256').update(`vault:${getMasterSecret()}`).digest();
}

function getSigningKey(): Buffer {
  return crypto.createHash('sha256').update(`session:${getMasterSecret()}`).digest();
}

export function hashPassword(password: string, _legacySalt?: string): { hash: string; salt: string } {
  const hash = bcrypt.hashSync(password, BCRYPT_COST_ROUNDS);
  return { hash, salt: 'bcrypt' };
}

export function verifyPassword(password: string, expectedHash: string, salt?: string): boolean {
  if (!password || !expectedHash) return false;
  try {
    if (
      expectedHash.startsWith('$2a$') ||
      expectedHash.startsWith('$2b$') ||
      expectedHash.startsWith('$2y$')
    ) {
      return bcrypt.compareSync(password, expectedHash);
    }
    if (!salt) return false;
    const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
    const expectedBuf = Buffer.from(expectedHash, 'hex');
    if (derived.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derived, expectedBuf);
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  if (!payload) return '';
  const parts = payload.split(':');
  if (parts.length !== 3) return '';
  try {
    const [ivB64, tagB64, dataB64] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const encrypted = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

export function maskApiKey(secret: string): string {
  const trimmed = secret.trim();
  if (!trimmed) return 'Not Configured';
  if (trimmed.length <= 8) return '••••••••';
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  return `${prefix}••••••••${suffix}`;
}

export interface SignedAdminTokenClaims {
  sid: string;
  aid: string;
  email: string;
  role: string;
  pwdVer: string;
  iat: number;
  exp: number;
}

export function computePasswordVersion(passwordHash: string): string {
  return crypto
    .createHash('sha256')
    .update(passwordHash || '')
    .digest('hex')
    .slice(0, 16);
}

export function signSessionToken(sessionId: string, claims?: Omit<SignedAdminTokenClaims, 'sid'>): string {
  if (claims) {
    const fullClaims: SignedAdminTokenClaims = { sid: sessionId, ...claims };
    const payloadB64 = Buffer.from(JSON.stringify(fullClaims), 'utf8').toString('base64url');
    const body = `v2.${payloadB64}`;
    const sig = crypto
      .createHmac('sha256', getSigningKey())
      .update(body)
      .digest('base64url');
    return `${body}.${sig}`;
  }
  const sig = crypto
    .createHmac('sha256', getSigningKey())
    .update(sessionId)
    .digest('base64url');
  return `${sessionId}.${sig}`;
}

export function verifyAdminSessionToken(token: string | undefined | null): SignedAdminTokenClaims | null {
  if (!token || typeof token !== 'string') return null;
  if (!token.startsWith('v2.')) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [prefix, payloadB64, providedSig] = parts;
  if (prefix !== 'v2' || !payloadB64 || !providedSig) return null;

  const body = `${prefix}.${payloadB64}`;
  const expectedSig = crypto
    .createHmac('sha256', getSigningKey())
    .update(body)
    .digest('base64url');

  try {
    const a = Buffer.from(providedSig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as SignedAdminTokenClaims;
    if (!parsed || typeof parsed.sid !== 'string' || typeof parsed.aid !== 'string') return null;
    if (typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function verifySignedSessionToken(token: string | undefined | null): string | null {
  if (!token || typeof token !== 'string') return null;
  if (token.startsWith('v2.')) {
    return verifyAdminSessionToken(token)?.sid || null;
  }
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;
  const sessionId = token.slice(0, dotIdx);
  const providedSig = token.slice(dotIdx + 1);
  if (!sessionId || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSigningKey())
    .update(sessionId)
    .digest('base64url');

  try {
    const a = Buffer.from(providedSig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
    return sessionId;
  } catch {
    return null;
  }
}

export function hashResetToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function signTaskMetaToken<T extends object>(payload: T): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getSigningKey()).update(`tts.${payloadB64}`).digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifyTaskMetaToken<T = any>(token: string | undefined | null): T | null {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  if (!payloadB64 || !providedSig) return null;
  const expectedSig = crypto
    .createHmac('sha256', getSigningKey())
    .update(`tts.${payloadB64}`)
    .digest('base64url');
  try {
    const a = Buffer.from(providedSig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

