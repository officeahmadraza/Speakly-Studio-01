import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
  providerId?: string;
  googleSub?: string;
  isGoogleAuth: boolean;
}

interface CertCache {
  certs: Record<string, string>;
  expiresAt: number;
}

let certCache: CertCache | null = null;
let cachedProjectId: string | null = null;

function getFirebaseProjectId(): string | null {
  if (cachedProjectId) return cachedProjectId;
  const envProjectId =
    process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || null;
  const candidates = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(__dirname, '../../firebase-applet-config.json'),
  ];
  for (const cfgPath of candidates) {
    try {
      if (fs.existsSync(cfgPath)) {
        const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        if (parsed?.projectId) {
          cachedProjectId = parsed.projectId;
          return cachedProjectId;
        }
      }
    } catch {
      // try next candidate
    }
  }
  if (envProjectId) {
    cachedProjectId = envProjectId;
  }
  return cachedProjectId;
}

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certCache && certCache.expiresAt > now) {
    return certCache.certs;
  }

  const res = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!res.ok) {
    throw new Error(`Failed to load Firebase public certificates (${res.status})`);
  }

  const certs = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSec = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 3600;

  certCache = {
    certs,
    expiresAt: now + Math.max(60, maxAgeSec) * 1000,
  };

  return certs;
}

function decodeBase64UrlJson(segment: string): any {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser | null> {
  if (!idToken || typeof idToken !== 'string') return null;
  const projectId = getFirebaseProjectId();
  if (!projectId) return null;

  const parts = idToken.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  let header: any;
  let payload: any;
  try {
    header = decodeBase64UrlJson(headerB64);
    payload = decodeBase64UrlJson(payloadB64);
  } catch {
    return null;
  }

  if (header?.alg !== 'RS256' || !header?.kid) return null;

  const certs = await getGooglePublicCerts();
  const certPem = certs[header.kid];
  if (!certPem) return null;

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const signature = Buffer.from(
    signatureB64.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  );

  if (!verifier.verify(certPem, signature)) {
    return null;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) return null;
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) return null;
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.sub || typeof payload.sub !== 'string') return null;

  const firebaseClaims = payload.firebase && typeof payload.firebase === 'object' ? payload.firebase : {};
  const signInProvider =
    typeof firebaseClaims.sign_in_provider === 'string' ? firebaseClaims.sign_in_provider : '';
  const googleIdentities = firebaseClaims.identities?.['google.com'];
  const googleSub =
    Array.isArray(googleIdentities) && typeof googleIdentities[0] === 'string'
      ? googleIdentities[0]
      : undefined;

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : '',
    emailVerified: Boolean(payload.email_verified),
    name: typeof payload.name === 'string' ? payload.name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
    providerId: signInProvider || undefined,
    googleSub,
    isGoogleAuth: signInProvider === 'google.com' || Boolean(googleSub),
  };
}

export async function extractFirebaseContext(
  req: { headers?: Record<string, any> },
  opts: { requireFirestore?: boolean; allowLocalFallback?: boolean } = {}
): Promise<{
  firebaseIdToken?: string;
  isAdminToken?: boolean;
  uid?: string;
  requireFirestore?: boolean;
  allowLocalFallback?: boolean;
}> {
  const authHeader = String(req?.headers?.authorization || '');
  const fbHeader = String(req?.headers?.['x-firebase-id-token'] || '');
  const rawToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : fbHeader.trim();

  if (!rawToken) {
    return {
      requireFirestore: opts.requireFirestore,
      allowLocalFallback: opts.allowLocalFallback,
    };
  }

  try {
    const verified = await verifyFirebaseIdToken(rawToken);
    if (!verified) {
      return {
        requireFirestore: opts.requireFirestore,
        allowLocalFallback: opts.allowLocalFallback,
      };
    }
    const isAdminToken = Boolean(
      verified.emailVerified && verified.email.toLowerCase() === 'officeahmadraza@gmail.com'
    );
    return {
      firebaseIdToken: rawToken,
      isAdminToken,
      uid: verified.uid,
      requireFirestore: opts.requireFirestore,
      allowLocalFallback: opts.allowLocalFallback,
    };
  } catch {
    return {
      requireFirestore: opts.requireFirestore,
      allowLocalFallback: opts.allowLocalFallback,
    };
  }
}

