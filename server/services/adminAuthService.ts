import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import {
  readDatabase,
  runDbTransaction,
  INITIAL_SUPER_ADMIN_EMAIL,
  syncBootstrapSuperAdmin,
} from '../db/database.js';
import {
  AdminAccount,
  AdminPermission,
  AdminSession,
  SpeaklyDatabase,
} from '../types/admin.js';
import {
  verifyPassword,
  hashPassword,
  signSessionToken,
  verifySignedSessionToken,
  verifyAdminSessionToken,
  computePasswordVersion,
  hashResetToken,
} from './cryptoVault.js';

export const ADMIN_SESSION_COOKIE = 'speakly_admin_session';
export const ADMIN_SESSION_IDLE_MS = 30 * 60 * 1000; // 30 minutes inactivity timeout
export const ADMIN_SESSION_MAX_MS = 12 * 60 * 60 * 1000; // 12 hours hard max

export interface AuthenticatedAdminRequest extends Request {
  adminAccount?: AdminAccount;
  adminSession?: AdminSession;
}

export function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function parseCookies(req: Request): Record<string, string> {
  const raw = req.headers.cookie;
  if (!raw || typeof raw !== 'string') return {};
  const result: Record<string, string> = {};
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

function getCookieSecurityOptions(res: Response): {
  sameSite: 'none' | 'lax';
  secure: boolean;
  partitioned?: boolean;
} {
  const req = res.req;
  const proto = String(req?.headers?.['x-forwarded-proto'] || '').toLowerCase();
  const isHttps = Boolean(req?.secure) || proto.includes('https');
  return isHttps
    ? { sameSite: 'none', secure: true, partitioned: true }
    : { sameSite: 'lax', secure: false };
}

export function extractRawAdminToken(req: Request): string | undefined {
  const cookies = parseCookies(req);
  if (cookies[ADMIN_SESSION_COOKIE]) {
    return cookies[ADMIN_SESSION_COOKIE];
  }
  const headerToken = req.headers['x-admin-session'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }
  return undefined;
}

export function setAdminSessionCookie(res: Response, signedToken: string): void {
  const opts = getCookieSecurityOptions(res);
  res.cookie(ADMIN_SESSION_COOKIE, signedToken, {
    httpOnly: true,
    sameSite: opts.sameSite,
    secure: opts.secure,
    ...(opts.partitioned ? { partitioned: true } : {}),
    path: '/',
    maxAge: ADMIN_SESSION_MAX_MS,
  } as any);
}

export function clearAdminSessionCookie(res: Response): void {
  const opts = getCookieSecurityOptions(res);
  res.clearCookie(ADMIN_SESSION_COOKIE, {
    httpOnly: true,
    sameSite: opts.sameSite,
    secure: opts.secure,
    ...(opts.partitioned ? { partitioned: true } : {}),
    path: '/',
  } as any);
}

export function sanitizeAdminAccount(account: AdminAccount) {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    permissions: account.permissions,
    isActive: account.isActive,
    mustChangePassword: false,
    lastLoginAt: account.lastLoginAt || null,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export function hasPermission(account: AdminAccount, permission: AdminPermission): boolean {
  if (!account.isActive) return false;
  if (account.role === 'Super Admin') return true;
  if (account.permissions.includes('*')) return true;
  return account.permissions.includes(permission);
}

export function recordAuditLog(
  db: SpeaklyDatabase,
  params: {
    adminId: string;
    adminEmail: string;
    adminRole: string;
    action: string;
    targetType: string;
    targetId: string;
    previousValue?: unknown;
    newValue?: unknown;
    ipAddress: string;
  }
): void {
  db.auditLogs.unshift({
    id: `aud_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    adminId: params.adminId,
    adminEmail: params.adminEmail,
    adminRole: params.adminRole,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    previousValue: params.previousValue ?? null,
    newValue: params.newValue ?? null,
    ipAddress: params.ipAddress,
    createdAt: new Date().toISOString(),
  });
  if (db.auditLogs.length > 5000) {
    db.auditLogs = db.auditLogs.slice(0, 5000);
  }
}

export function validatePasswordStrength(password: string): string | null {
  if (!password || typeof password !== 'string') {
    return 'Password is required.';
  }
  if (password.length < 10) {
    return 'Password must be at least 10 characters long.';
  }
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const categories = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;
  if (categories < 3) {
    return 'Password must contain at least 3 of: uppercase letters, lowercase letters, numbers, and symbols.';
  }
  return null;
}

function computeAccountTokenVersion(account: AdminAccount): string {
  if (account.passwordRevision) {
    return computePasswordVersion(account.passwordRevision);
  }
  const envAdminPwd = (process.env.ADMIN_PASSWORD || '').trim();
  if (account.id === 'admin_super_root' && envAdminPwd) {
    return computePasswordVersion(`root:${envAdminPwd}`);
  }
  return computePasswordVersion(account.passwordHash);
}

export async function authenticateAdmin(
  email: string,
  password: string,
  ipAddress: string,
  userAgent: string,
  fbCtx?: { firebaseIdToken?: string; isAdminToken?: boolean; uid?: string }
): Promise<{
  account: ReturnType<typeof sanitizeAdminAccount>;
  signedToken: string;
}> {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail || !password) {
    throw Object.assign(new Error('Email and password are required.'), { statusCode: 400 });
  }

  return runDbTransaction((db) => {
    syncBootstrapSuperAdmin(db);

    const account = db.adminAccounts.find((a) => a.email.toLowerCase() === normalizedEmail);
    if (!account) {
      throw Object.assign(new Error('Invalid administrator email or password. Please try again.'), {
        statusCode: 401,
      });
    }

    if (!account.isActive) {
      throw Object.assign(
        new Error('This administrator account is currently deactivated. Contact the Super Admin.'),
        { statusCode: 403 }
      );
    }

    const valid = verifyPassword(password, account.passwordHash, account.passwordSalt);
    if (!valid) {
      recordAuditLog(db, {
        adminId: account.id,
        adminEmail: account.email,
        adminRole: account.role,
        action: 'ADMIN_LOGIN_FAILED',
        targetType: 'admin_account',
        targetId: account.id,
        ipAddress,
      });
      throw Object.assign(new Error('Invalid administrator email or password. Please try again.'), {
        statusCode: 401,
      });
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    // Prune expired sessions
    db.adminSessions = db.adminSessions.filter(
      (s) => s.expiresAt > nowMs && nowMs - s.lastActivityAt <= ADMIN_SESSION_IDLE_MS
    );

    const sessionId = `sess_${crypto.randomBytes(24).toString('hex')}`;
    const session: AdminSession = {
      id: sessionId,
      adminId: account.id,
      email: account.email,
      role: account.role,
      ipAddress,
      userAgent: (userAgent || '').slice(0, 200),
      createdAt: nowMs,
      lastActivityAt: nowMs,
      expiresAt: nowMs + ADMIN_SESSION_MAX_MS,
    };

    db.adminSessions.unshift(session);
    account.lastLoginAt = nowIso;
    account.updatedAt = nowIso;

    recordAuditLog(db, {
      adminId: account.id,
      adminEmail: account.email,
      adminRole: account.role,
      action: 'ADMIN_LOGIN',
      targetType: 'admin_session',
      targetId: sessionId,
      newValue: { email: account.email, role: account.role },
      ipAddress,
    });

    const signedToken = signSessionToken(sessionId, {
      aid: account.id,
      email: account.email,
      role: account.role,
      pwdVer: computeAccountTokenVersion(account),
      iat: nowMs,
      exp: session.expiresAt,
    });
    return {
      account: sanitizeAdminAccount(account),
      signedToken,
    };
  }, { ...(fbCtx || {}), allowLocalFallback: true });
}

const revokedSessionIds = new Set<string>();

export async function resolveAdminSession(
  req: Request
): Promise<{ account: AdminAccount; session: AdminSession } | null> {
  const rawToken = extractRawAdminToken(req);
  const v2Claims = verifyAdminSessionToken(rawToken);
  const sessionId = v2Claims ? v2Claims.sid : verifySignedSessionToken(rawToken);
  if (!sessionId || revokedSessionIds.has(sessionId)) return null;

  const db = readDatabase();
  const nowMs = Date.now();
  let session = db.adminSessions.find((s) => s.id === sessionId);

  if (session) {
    if (session.expiresAt <= nowMs || nowMs - session.lastActivityAt > ADMIN_SESSION_IDLE_MS) {
      await runDbTransaction((txDb) => {
        txDb.adminSessions = txDb.adminSessions.filter((s) => s.id !== sessionId);
      }, { allowLocalFallback: true }).catch(() => undefined);
      return null;
    }

    const account = db.adminAccounts.find((a) => a.id === session!.adminId);
    if (!account || !account.isActive) {
      return null;
    }

    if (v2Claims && v2Claims.pwdVer !== computeAccountTokenVersion(account)) {
      return null;
    }

    if (nowMs - session.lastActivityAt > 30_000) {
      await runDbTransaction((txDb) => {
        const target = txDb.adminSessions.find((s) => s.id === sessionId);
        if (target) target.lastActivityAt = nowMs;
      }, { allowLocalFallback: true }).catch(() => undefined);
    }

    return { account, session };
  }

  // Cross-instance serverless fallback: verify signed v2 token claims against active admin account
  if (!v2Claims) return null;

  const account = db.adminAccounts.find(
    (a) => a.id === v2Claims.aid || a.email.toLowerCase() === v2Claims.email.toLowerCase()
  );
  if (!account || !account.isActive) return null;
  if (v2Claims.pwdVer !== computeAccountTokenVersion(account)) return null;

  const hydratedSession: AdminSession = {
    id: sessionId,
    adminId: account.id,
    email: account.email,
    role: account.role,
    ipAddress: getClientIp(req),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
    createdAt: v2Claims.iat || nowMs,
    lastActivityAt: nowMs,
    expiresAt: v2Claims.exp,
  };

  await runDbTransaction((txDb) => {
    if (!txDb.adminSessions.some((s) => s.id === sessionId)) {
      txDb.adminSessions.unshift(hydratedSession);
    }
  }, { allowLocalFallback: true }).catch(() => undefined);

  return { account, session: hydratedSession };
}

export async function destroyAdminSession(req: Request, res: Response): Promise<void> {
  const rawToken = extractRawAdminToken(req);
  const sessionId = verifySignedSessionToken(rawToken);
  clearAdminSessionCookie(res);

  if (!sessionId) return;

  revokedSessionIds.add(sessionId);
  const ipAddress = getClientIp(req);
  await runDbTransaction((db) => {
    const existing = db.adminSessions.find((s) => s.id === sessionId);
    if (existing) {
      recordAuditLog(db, {
        adminId: existing.adminId,
        adminEmail: existing.email,
        adminRole: existing.role,
        action: 'ADMIN_LOGOUT',
        targetType: 'admin_session',
        targetId: sessionId,
        ipAddress,
      });
    }
    db.adminSessions = db.adminSessions.filter((s) => s.id !== sessionId);
  }, { allowLocalFallback: true });
}

export async function requireAdminAuth(
  req: AuthenticatedAdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const resolved = await resolveAdminSession(req);
    if (!resolved) {
      clearAdminSessionCookie(res);
      res.status(401).json({
        success: false,
        error: 'Administrator authentication required or session expired.',
        code: 'ADMIN_UNAUTHORIZED',
      });
      return;
    }
    req.adminAccount = resolved.account;
    req.adminSession = resolved.session;
    next();
  } catch (err) {
    next(err);
  }
}

export function requirePermission(permission: AdminPermission) {
  return (req: AuthenticatedAdminRequest, res: Response, next: NextFunction): void => {
    if (!req.adminAccount) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    if (!hasPermission(req.adminAccount, permission)) {
      res.status(403).json({
        success: false,
        error: `Forbidden: Missing required permission (${permission}).`,
        code: 'INSUFFICIENT_PERMISSION',
      });
      return;
    }
    next();
  };
}

export async function changeAdminPassword(
  adminId: string,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string,
  ipAddress: string
): Promise<ReturnType<typeof sanitizeAdminAccount>> {
  const strengthErr = validatePasswordStrength(newPassword);
  if (strengthErr) {
    throw Object.assign(new Error(strengthErr), { statusCode: 400 });
  }

  return runDbTransaction((db) => {
    const account = db.adminAccounts.find((a) => a.id === adminId);
    if (!account || !account.isActive) {
      throw Object.assign(new Error('Administrator account not found.'), { statusCode: 404 });
    }

    if (!verifyPassword(currentPassword, account.passwordHash, account.passwordSalt)) {
      throw Object.assign(new Error('Current password is incorrect.'), {
        statusCode: 400,
        code: 'INVALID_CURRENT_PASSWORD',
      });
    }

    if (currentPassword === newPassword) {
      throw Object.assign(
        new Error('New password must be different from your current password.'),
        { statusCode: 400 }
      );
    }

    const { hash, salt } = hashPassword(newPassword);
    account.passwordHash = hash;
    account.passwordSalt = salt;
    account.passwordRevision = crypto.randomBytes(8).toString('hex');
    account.mustChangePassword = false;
    account.resetTokenHash = null;
    account.resetTokenExpiresAt = null;
    account.updatedAt = new Date().toISOString();

    // Revoke other active sessions for this admin after password change
    db.adminSessions = db.adminSessions.filter(
      (s) => s.adminId !== adminId || s.id === currentSessionId
    );

    recordAuditLog(db, {
      adminId: account.id,
      adminEmail: account.email,
      adminRole: account.role,
      action: 'ADMIN_PASSWORD_CHANGED',
      targetType: 'admin_account',
      targetId: account.id,
      ipAddress,
    });

    return sanitizeAdminAccount(account);
  }, { allowLocalFallback: true });
}

export async function requestAdminPasswordReset(email: string, ipAddress: string): Promise<void> {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) return;

  await runDbTransaction((db) => {
    const account = db.adminAccounts.find((a) => a.email.toLowerCase() === normalized);
    if (!account || !account.isActive) return;

    const rawToken = crypto.randomBytes(24).toString('hex');
    account.resetTokenHash = hashResetToken(rawToken);
    account.resetTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    account.updatedAt = new Date().toISOString();

    recordAuditLog(db, {
      adminId: account.id,
      adminEmail: account.email,
      adminRole: account.role,
      action: 'ADMIN_PASSWORD_RESET_REQUESTED',
      targetType: 'admin_account',
      targetId: account.id,
      ipAddress,
    });
  }, { allowLocalFallback: true });
}

export async function confirmAdminPasswordReset(params: {
  email: string;
  verificationSecret: string;
  newPassword: string;
  ipAddress: string;
}): Promise<void> {
  const normalized = (params.email || '').trim().toLowerCase();
  if (!normalized || !params.verificationSecret || !params.newPassword) {
    throw Object.assign(new Error('Email, verification secret/token, and new password are required.'), {
      statusCode: 400,
    });
  }

  const strengthErr = validatePasswordStrength(params.newPassword);
  if (strengthErr) {
    throw Object.assign(new Error(strengthErr), { statusCode: 400 });
  }

  await runDbTransaction((db) => {
    const account = db.adminAccounts.find((a) => a.email.toLowerCase() === normalized);
    if (!account || !account.isActive) {
      throw Object.assign(new Error('Invalid reset verification credentials.'), { statusCode: 400 });
    }

    const tokenHash = hashResetToken(params.verificationSecret.trim());
    const hasValidResetToken =
      Boolean(account.resetTokenHash) &&
      Boolean(account.resetTokenExpiresAt) &&
      new Date(account.resetTokenExpiresAt!).getTime() > Date.now() &&
      account.resetTokenHash === tokenHash;

    // Also allow initial root Super Admin emergency recovery using server env ADMIN_PASSWORD
    const envAdminPwd = (process.env.ADMIN_PASSWORD || '').trim();
    const isEnvRootMatch =
      account.email.toLowerCase() === INITIAL_SUPER_ADMIN_EMAIL.toLowerCase() &&
      Boolean(envAdminPwd) &&
      params.verificationSecret === envAdminPwd;

    if (!hasValidResetToken && !isEnvRootMatch) {
      throw Object.assign(
        new Error(
          'Invalid or expired reset token. Provide a valid reset token issued by a Super Admin, or verify with the server ADMIN_PASSWORD secret for the root Super Admin account.'
        ),
        { statusCode: 401 }
      );
    }

    const { hash, salt } = hashPassword(params.newPassword);
    account.passwordHash = hash;
    account.passwordSalt = salt;
    account.passwordRevision = crypto.randomBytes(8).toString('hex');
    account.mustChangePassword = false;
    account.resetTokenHash = null;
    account.resetTokenExpiresAt = null;
    account.updatedAt = new Date().toISOString();

    // Invalidate all sessions for this admin
    db.adminSessions = db.adminSessions.filter((s) => s.adminId !== account.id);

    recordAuditLog(db, {
      adminId: account.id,
      adminEmail: account.email,
      adminRole: account.role,
      action: 'ADMIN_PASSWORD_RESET_COMPLETED',
      targetType: 'admin_account',
      targetId: account.id,
      ipAddress: params.ipAddress,
    });
  }, { allowLocalFallback: true });
}
