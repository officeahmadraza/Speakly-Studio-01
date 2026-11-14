import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { createRateLimiter } from '../rateLimiter.js';
import {
  readDatabase,
  runDbTransaction,
  isSuperAdminPasswordConfigured,
  getDatabaseMode,
} from '../db/database.js';
import {
  AdminRole,
  AdminPermission,
  ROLE_PERMISSIONS_MAP,
  PricingPlanRecord,
  ApiIntegrationRecord,
  CreditTransactionType,
} from '../types/admin.js';
import {
  authenticateAdmin,
  setAdminSessionCookie,
  destroyAdminSession,
  requireAdminAuth,
  requirePermission,
  sanitizeAdminAccount,
  changeAdminPassword,
  requestAdminPasswordReset,
  confirmAdminPasswordReset,
  recordAuditLog,
  getClientIp,
  validatePasswordStrength,
  AuthenticatedAdminRequest,
} from '../services/adminAuthService.js';
import { encryptSecret, decryptSecret, maskApiKey, hashPassword } from '../services/cryptoVault.js';
import { openspeakerRequest } from '../services/openspeakerClient.js';
import { fetchVoiceCatalog, mergeVoicesWithOverrides, invalidateVoiceCache } from '../services/voiceService.js';

const router = express.Router();

const adminLoginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many failed or repeated login attempts. Please wait 15 minutes before trying again.',
});

const adminResetRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 6,
  message: 'Too many password reset requests. Please try again later.',
});

function sanitizeIntegration(record: ApiIntegrationRecord) {
  return {
    id: record.id,
    providerName: record.providerName,
    providerType: record.providerType,
    endpointUrl: record.endpointUrl,
    modelName: record.modelName,
    maskedKey: record.maskedKey,
    hasKey: Boolean(record.encryptedApiKey),
    isEnabled: record.isEnabled,
    isPrimary: record.isPrimary,
    rateLimitPerMin: record.rateLimitPerMin,
    usageCount: record.usageCount,
    totalEstimatedCostUsd: record.totalEstimatedCostUsd,
    lastTestedAt: record.lastTestedAt,
    lastStatus: record.lastStatus,
    lastStatusMessage: record.lastStatusMessage,
    recentErrors: record.recentErrors.slice(0, 20),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// 1. Public Admin Auth Status, Login, Logout, Password Reset
// ---------------------------------------------------------------------------

router.get('/auth/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const superAdminConfigured = isSuperAdminPasswordConfigured();
    // Dynamically import resolveAdminSession via auth service
    const { resolveAdminSession } = await import('../services/adminAuthService.js');
    const sessionData = await resolveAdminSession(req);
    res.json({
      success: true,
      superAdminConfigured,
      authenticated: Boolean(sessionData),
      admin: sessionData ? sanitizeAdminAccount(sessionData.account) : null,
      databaseMode: getDatabaseMode(),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', adminLoginRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body || {};
    if (!isSuperAdminPasswordConfigured()) {
      return res.status(503).json({
        success: false,
        error:
          'Super Admin bootstrap password is not configured. Set the ADMIN_PASSWORD environment variable on the server and retry.',
        code: 'ADMIN_PASSWORD_UNCONFIGURED',
      });
    }

    const ip = getClientIp(req);
    const ua = String(req.headers['user-agent'] || '');
    const { account, signedToken } = await authenticateAdmin(email, password, ip, ua);

    setAdminSessionCookie(res, signedToken);
    res.json({
      success: true,
      admin: account,
      sessionToken: signedToken,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await destroyAdminSession(req, res);
    res.json({ success: true, message: 'Signed out cleanly.' });
  } catch (err) {
    next(err);
  }
});

router.post('/password-reset/request', adminResetRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body || {};
    await requestAdminPasswordReset(email, getClientIp(req));
    res.json({
      success: true,
      message:
        'If an active administrator account matches that email, a reset request has been logged. Enter your reset token (or root ADMIN_PASSWORD secret for the Super Admin account) below to set a new password.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/password-reset/confirm', adminResetRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, verificationSecret, newPassword } = req.body || {};
    await confirmAdminPasswordReset({
      email,
      verificationSecret,
      newPassword,
      ipAddress: getClientIp(req),
    });
    res.json({
      success: true,
      message: 'Password has been reset successfully. You may now sign in with your new password.',
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Authenticated Admin Routes (Session Required)
// ---------------------------------------------------------------------------
router.use(requireAdminAuth);

router.get('/me', (req: AuthenticatedAdminRequest, res: Response) => {
  res.json({
    success: true,
    admin: sanitizeAdminAccount(req.adminAccount!),
    databaseMode: getDatabaseMode(),
  });
});

router.post('/change-password', async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body || {};
    if (confirmNewPassword !== undefined && newPassword !== confirmNewPassword) {
      return res.status(400).json({
        success: false,
        error: 'New password and confirmation do not match.',
      });
    }
    const updated = await changeAdminPassword(
      req.adminAccount!.id,
      req.adminSession!.id,
      currentPassword,
      newPassword,
      getClientIp(req)
    );
    res.json({
      success: true,
      admin: updated,
      message: 'Administrator password updated successfully.',
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 2. Dashboard Overview (Real DB KPIs + Interactive Charts + Recent Activity)
// ---------------------------------------------------------------------------
router.get('/overview', requirePermission('dashboard:view'), (req: AuthenticatedAdminRequest, res: Response) => {
  const db = readDatabase();
  const daysParam = Math.min(90, Math.max(7, Number(req.query.days) || 14));

  const users = db.users;
  const activeUsers = users.filter((u) => u.status === 'active').length;
  const suspendedUsers = users.filter((u) => u.status === 'suspended').length;

  const totalCreditsPurchased = users.reduce((sum, u) => sum + (u.totalPurchasedCredits || 0), 0);
  const totalCreditsConsumed = users.reduce((sum, u) => sum + (u.totalConsumedCredits || 0), 0);
  const totalRemainingCredits = users.reduce((sum, u) => sum + (u.remainingCredits || 0), 0);

  const approvedPayments = db.paymentRequests.filter((p) => p.status === 'approved');
  const pendingPayments = db.paymentRequests.filter((p) => p.status === 'pending');
  const rejectedPayments = db.paymentRequests.filter((p) => p.status === 'rejected');

  const totalRevenueUsd = approvedPayments.reduce((sum, p) => sum + (Number(p.amountUsd) || 0), 0);
  const activeSubscriptions = users.filter(
    (u) =>
      u.status === 'active' &&
      u.planId !== 'plan_starter' &&
      (!u.subscriptionExpiresAt || new Date(u.subscriptionExpiresAt).getTime() > Date.now())
  ).length;

  const totalSpeechGenerations = db.speechHistory.length;
  const totalProjects = db.projects.length;
  const totalApiCalls = db.apiIntegrations.reduce((sum, i) => sum + (i.usageCount || 0), 0);
  const totalEstimatedApiCostUsd =
    Math.round(db.apiIntegrations.reduce((sum, i) => sum + (i.totalEstimatedCostUsd || 0), 0) * 10000) /
    10000;
  const recentApiErrorsCount = db.apiIntegrations.reduce(
    (sum, i) => sum + (i.recentErrors?.length || 0),
    0
  );
  const welcomeClaims = db.welcomeBonusClaims || [];
  const totalWelcomeCreditsDistributed = welcomeClaims.reduce(
    (sum, c) => sum + (Number(c.amountAwarded) || 0),
    0
  );
  const welcomeBonusRecipientsCount = welcomeClaims.length;

  // Build day-by-day buckets over `daysParam` days
  const dayBuckets: string[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = daysParam - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    dayBuckets.push(d.toISOString().slice(0, 10));
  }

  const revenueByDay = new Map<string, number>(dayBuckets.map((d) => [d, 0]));
  const registrationsByDay = new Map<string, number>(dayBuckets.map((d) => [d, 0]));
  const creditsByDay = new Map<string, number>(dayBuckets.map((d) => [d, 0]));
  const speechesByDay = new Map<string, number>(dayBuckets.map((d) => [d, 0]));

  for (const p of approvedPayments) {
    const day = (p.reviewedAt || p.createdAt).slice(0, 10);
    if (revenueByDay.has(day)) {
      revenueByDay.set(day, (revenueByDay.get(day) || 0) + (Number(p.amountUsd) || 0));
    }
  }

  for (const u of users) {
    const day = u.createdAt.slice(0, 10);
    if (registrationsByDay.has(day)) {
      registrationsByDay.set(day, (registrationsByDay.get(day) || 0) + 1);
    }
  }

  for (const tx of db.creditTransactions) {
    if (tx.type === 'consumption' || tx.amount < 0) {
      const day = tx.createdAt.slice(0, 10);
      if (creditsByDay.has(day)) {
        creditsByDay.set(day, (creditsByDay.get(day) || 0) + Math.abs(tx.amount));
      }
    }
  }

  for (const s of db.speechHistory) {
    const day = s.createdAt.slice(0, 10);
    if (speechesByDay.has(day)) {
      speechesByDay.set(day, (speechesByDay.get(day) || 0) + 1);
    }
  }

  // Subscription distribution from real users
  const planCounts = new Map<string, number>();
  for (const u of users) {
    const name = u.planName || 'Starter';
    planCounts.set(name, (planCounts.get(name) || 0) + 1);
  }
  const subscriptionDistribution = Array.from(planCounts.entries()).map(([label, value]) => ({
    label,
    value,
  }));

  res.json({
    success: true,
    kpis: {
      totalUsers: users.length,
      activeUsers,
      suspendedUsers,
      totalCreditsPurchased,
      totalCreditsConsumed,
      totalRemainingCredits,
      totalRevenueUsd,
      pendingPayments: pendingPayments.length,
      approvedPayments: approvedPayments.length,
      rejectedPayments: rejectedPayments.length,
      activeSubscriptions,
      totalSpeechGenerations,
      totalProjects,
      totalApiCalls,
      totalEstimatedApiCostUsd,
      recentApiErrorsCount,
      totalWelcomeCreditsDistributed,
      welcomeBonusRecipientsCount,
    },
    charts: {
      revenueOverTime: dayBuckets.map((date) => ({ date, value: revenueByDay.get(date) || 0 })),
      registrationTrends: dayBuckets.map((date) => ({ date, value: registrationsByDay.get(date) || 0 })),
      creditConsumption: dayBuckets.map((date) => ({ date, value: creditsByDay.get(date) || 0 })),
      speechActivity: dayBuckets.map((date) => ({ date, value: speechesByDay.get(date) || 0 })),
      subscriptionDistribution,
    },
    recentRegistrations: [...users]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 6),
    recentTransactions: [...db.paymentRequests]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8),
    recentActivities: db.auditLogs.slice(0, 10),
  });
});

// ---------------------------------------------------------------------------
// 3. Complete User Management
// ---------------------------------------------------------------------------
router.get('/users', requirePermission('users:view'), (req: AuthenticatedAdminRequest, res: Response) => {
  const db = readDatabase();
  const q = String(req.query.q || '').trim().toLowerCase();
  const statusFilter = String(req.query.status || 'all');
  const planFilter = String(req.query.plan || 'all');
  const googleFilter = String(req.query.google || 'all');

  let filtered = [...db.users];
  if (q) {
    filtered = filtered.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q) ||
        (u.googleSub || '').toLowerCase().includes(q)
    );
  }
  if (statusFilter !== 'all') {
    filtered = filtered.filter((u) => u.status === statusFilter);
  }
  if (planFilter !== 'all') {
    filtered = filtered.filter((u) => u.planId === planFilter || u.planName === planFilter);
  }
  if (googleFilter === 'google') {
    filtered = filtered.filter((u) => u.authProvider === 'google' || Boolean(u.googleSub));
  } else if (googleFilter === 'bonus_claimed') {
    filtered = filtered.filter((u) => Boolean(u.welcomeBonusClaimed));
  } else if (googleFilter === 'no_bonus') {
    filtered = filtered.filter((u) => !u.welcomeBonusClaimed);
  }

  filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({
    success: true,
    users: filtered,
    total: filtered.length,
  });
});

router.get('/users/:uid', requirePermission('users:view'), (req: AuthenticatedAdminRequest, res: Response) => {
  const db = readDatabase();
  const user = db.users.find((u) => u.uid === req.params.uid);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }

  const projects = db.projects.filter((p) => p.userId === user.uid);
  const paymentHistory = db.paymentRequests.filter((p) => p.userId === user.uid);
  const creditTransactions = db.creditTransactions.filter((c) => c.userId === user.uid);
  const speechHistory = db.speechHistory.filter((s) => s.userId === user.uid);

  res.json({
    success: true,
    user,
    projects,
    paymentHistory,
    creditTransactions,
    speechHistory,
  });
});

router.patch('/users/:uid', requirePermission('users:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const { displayName, planId, billingCycle, notes, subscriptionExpiresAt } = req.body || {};
    const admin = req.adminAccount!;
    const ip = getClientIp(req);

    const updated = await runDbTransaction((db) => {
      const user = db.users.find((u) => u.uid === req.params.uid);
      if (!user) {
        throw Object.assign(new Error('User not found.'), { statusCode: 404 });
      }

      const prevSnapshot = {
        displayName: user.displayName,
        planId: user.planId,
        planName: user.planName,
        billingCycle: user.billingCycle,
        notes: user.notes || '',
      };

      if (typeof displayName === 'string' && displayName.trim()) {
        user.displayName = displayName.trim();
      }
      if (typeof notes === 'string') {
        user.notes = notes.trim();
      }
      if (planId && typeof planId === 'string') {
        const plan = db.pricingPlans.find((p) => p.id === planId);
        if (!plan) {
          throw Object.assign(new Error('Selected pricing plan does not exist.'), { statusCode: 400 });
        }
        user.planId = plan.id;
        user.planName = plan.name;
        if (billingCycle === 'monthly' || billingCycle === 'yearly' || billingCycle === 'lifetime') {
          user.billingCycle = billingCycle;
        }
        if (subscriptionExpiresAt !== undefined) {
          user.subscriptionExpiresAt = subscriptionExpiresAt;
        } else if (plan.durationDays > 0) {
          const days = billingCycle === 'yearly' ? 365 : plan.durationDays;
          user.subscriptionExpiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
        }
      }
      user.updatedAt = new Date().toISOString();

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'USER_UPDATED',
        targetType: 'user',
        targetId: user.uid,
        previousValue: prevSnapshot,
        newValue: {
          displayName: user.displayName,
          planId: user.planId,
          planName: user.planName,
          billingCycle: user.billingCycle,
          notes: user.notes || '',
        },
        ipAddress: ip,
      });

      return user;
    });

    res.json({ success: true, user: updated });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:uid/suspend', requirePermission('users:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const reason = String(req.body?.reason || 'Administrative suspension').trim();
    const admin = req.adminAccount!;
    const ip = getClientIp(req);

    const user = await runDbTransaction((db) => {
      const target = db.users.find((u) => u.uid === req.params.uid);
      if (!target) throw Object.assign(new Error('User not found.'), { statusCode: 404 });
      const prevStatus = target.status;
      target.status = 'suspended';
      target.updatedAt = new Date().toISOString();

      db.userNotifications.unshift({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: target.uid,
        title: 'Account Suspended',
        message: `Your account was suspended: ${reason}`,
        type: 'error',
        read: false,
        createdAt: target.updatedAt,
      });

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'USER_SUSPENDED',
        targetType: 'user',
        targetId: target.uid,
        previousValue: { status: prevStatus },
        newValue: { status: 'suspended', reason },
        ipAddress: ip,
      });
      return target;
    });

    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:uid/reactivate', requirePermission('users:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const admin = req.adminAccount!;
    const ip = getClientIp(req);

    const user = await runDbTransaction((db) => {
      const target = db.users.find((u) => u.uid === req.params.uid);
      if (!target) throw Object.assign(new Error('User not found.'), { statusCode: 404 });
      const prevStatus = target.status;
      target.status = 'active';
      target.updatedAt = new Date().toISOString();

      db.userNotifications.unshift({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: target.uid,
        title: 'Account Reactivated',
        message: 'Your Speakly Studio account has been reactivated and is ready for use.',
        type: 'success',
        read: false,
        createdAt: target.updatedAt,
      });

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'USER_REACTIVATED',
        targetType: 'user',
        targetId: target.uid,
        previousValue: { status: prevStatus },
        newValue: { status: 'active' },
        ipAddress: ip,
      });
      return target;
    });

    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:uid', requirePermission('users:delete'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const admin = req.adminAccount!;
    const ip = getClientIp(req);

    await runDbTransaction((db) => {
      const idx = db.users.findIndex((u) => u.uid === req.params.uid);
      if (idx === -1) throw Object.assign(new Error('User not found.'), { statusCode: 404 });
      const target = db.users[idx];

      db.users.splice(idx, 1);
      db.projects = db.projects.filter((p) => p.userId !== target.uid);
      db.userNotifications = db.userNotifications.filter((n) => n.userId !== target.uid);

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'USER_DELETED',
        targetType: 'user',
        targetId: target.uid,
        previousValue: { email: target.email, displayName: target.displayName, planName: target.planName },
        ipAddress: ip,
      });
    });

    res.json({ success: true, message: 'User permanently deleted.' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 4. Credit Management
// ---------------------------------------------------------------------------
router.get('/credits/transactions', requirePermission('credits:view'), (req: AuthenticatedAdminRequest, res: Response) => {
  const db = readDatabase();
  const q = String(req.query.q || '').trim().toLowerCase();
  const typeFilter = String(req.query.type || 'all');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');

  let list = [...db.creditTransactions];
  if (q) {
    list = list.filter(
      (t) =>
        (t.userEmail || '').toLowerCase().includes(q) ||
        (t.userName || '').toLowerCase().includes(q) ||
        t.userId.toLowerCase().includes(q) ||
        (t.googleSub || '').toLowerCase().includes(q) ||
        t.reason.toLowerCase().includes(q)
    );
  }
  if (typeFilter !== 'all') {
    list = list.filter((t) => t.type === typeFilter);
  }
  if (dateFrom) {
    list = list.filter((t) => t.createdAt.slice(0, 10) >= dateFrom);
  }
  if (dateTo) {
    list = list.filter((t) => t.createdAt.slice(0, 10) <= dateTo);
  }

  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const welcomeClaims = db.welcomeBonusClaims || [];

  res.json({
    success: true,
    transactions: list,
    summary: {
      totalPurchased: db.users.reduce((s, u) => s + (u.totalPurchasedCredits || 0), 0),
      totalConsumed: db.users.reduce((s, u) => s + (u.totalConsumedCredits || 0), 0),
      totalRemaining: db.users.reduce((s, u) => s + (u.remainingCredits || 0), 0),
      welcomeCreditsDistributed: welcomeClaims.reduce((s, c) => s + (Number(c.amountAwarded) || 0), 0),
      welcomeBonusCount: welcomeClaims.length,
    },
  });
});

router.post('/credits/adjust', requirePermission('credits:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const { userId, mode, amount, reason, note } = req.body || {};
    const numAmount = Number(amount);
    if (!userId || !['add', 'deduct', 'set'].includes(mode)) {
      return res.status(400).json({ success: false, error: 'Valid userId and adjustment mode (add, deduct, set) are required.' });
    }
    if (!Number.isFinite(numAmount) || numAmount < 0 || (mode !== 'set' && numAmount <= 0)) {
      return res.status(400).json({ success: false, error: 'Credit amount must be a valid positive number.' });
    }
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ success: false, error: 'An adjustment reason is required.' });
    }

    const admin = req.adminAccount!;
    const ip = getClientIp(req);

    const result = await runDbTransaction((db) => {
      const user = db.users.find((u) => u.uid === userId);
      if (!user) throw Object.assign(new Error('Target user not found.'), { statusCode: 404 });

      const previousBalance = user.remainingCredits || 0;
      let newBalance = previousBalance;
      let delta = 0;
      let txType: CreditTransactionType = 'manual_add';

      if (mode === 'add') {
        delta = Math.round(numAmount);
        newBalance = previousBalance + delta;
        txType = 'manual_add';
      } else if (mode === 'deduct') {
        const deductAmt = Math.min(previousBalance, Math.round(numAmount));
        delta = -deductAmt;
        newBalance = previousBalance - deductAmt;
        txType = 'manual_deduct';
      } else if (mode === 'set') {
        newBalance = Math.round(numAmount);
        delta = newBalance - previousBalance;
        txType = 'balance_override';
      }

      user.remainingCredits = newBalance;
      user.updatedAt = new Date().toISOString();

      const txRecord = {
        id: `ctx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName,
        previousBalance,
        amount: delta,
        newBalance,
        type: txType,
        reason: String(reason).trim(),
        note: note ? String(note).trim() : '',
        adminId: admin.id,
        adminEmail: admin.email,
        createdAt: user.updatedAt,
      };

      db.creditTransactions.unshift(txRecord);

      db.userNotifications.unshift({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: user.uid,
        title: 'Credit Balance Updated',
        message: `An administrator adjusted your credits (${delta >= 0 ? `+${delta}` : delta}). Reason: ${txRecord.reason}. New balance: ${newBalance.toLocaleString()} credits.`,
        type: delta >= 0 ? 'success' : 'info',
        read: false,
        createdAt: user.updatedAt,
      });

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: `CREDITS_${mode.toUpperCase()}`,
        targetType: 'user',
        targetId: user.uid,
        previousValue: { remainingCredits: previousBalance },
        newValue: { remainingCredits: newBalance, delta, reason: txRecord.reason, note: txRecord.note },
        ipAddress: ip,
      });

      return { user, transaction: txRecord };
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 5. Payment & Transaction Management (Idempotent Atomic Approve / Reject)
// ---------------------------------------------------------------------------
router.get('/payments', requirePermission('payments:view'), (req: AuthenticatedAdminRequest, res: Response) => {
  const db = readDatabase();
  const q = String(req.query.q || '').trim().toLowerCase();
  const statusFilter = String(req.query.status || 'all');

  let list = [...db.paymentRequests];
  if (q) {
    list = list.filter(
      (p) =>
        p.userEmail.toLowerCase().includes(q) ||
        p.userName.toLowerCase().includes(q) ||
        p.transactionId.toLowerCase().includes(q) ||
        p.planName.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
    );
  }
  if (statusFilter !== 'all') {
    list = list.filter((p) => p.status === statusFilter);
  }

  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({ success: true, payments: list });
});

router.get('/payments/:id/receipt', requirePermission('payments:view'), (req: AuthenticatedAdminRequest, res: Response) => {
  const db = readDatabase();
  const receipt = db.paymentReceipts.find((r) => r.paymentId === req.params.id);
  if (!receipt) {
    return res.status(404).json({ success: false, error: 'No receipt uploaded for this payment.' });
  }
  res.json({ success: true, receipt });
});

router.post('/payments/:id/approve', requirePermission('payments:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const adminNote = String(req.body?.adminNote || '').trim();
    const admin = req.adminAccount!;
    const ip = getClientIp(req);

    const result = await runDbTransaction((db) => {
      const payment = db.paymentRequests.find((p) => p.id === req.params.id);
      if (!payment) {
        throw Object.assign(new Error('Payment request not found.'), { statusCode: 404 });
      }
      if (payment.status !== 'pending') {
        throw Object.assign(
          new Error(`Payment request has already been ${payment.status}. Duplicate credit allocation blocked.`),
          { statusCode: 409 }
        );
      }

      const user = db.users.find((u) => u.uid === payment.userId);
      if (!user) {
        throw Object.assign(new Error('Associated user account no longer exists.'), { statusCode: 404 });
      }

      const nowIso = new Date().toISOString();
      const prevCredits = user.remainingCredits || 0;
      const grant = payment.creditsToGrant || 0;
      const newBalance = prevCredits + grant;

      user.remainingCredits = newBalance;
      user.totalPurchasedCredits = (user.totalPurchasedCredits || 0) + grant;
      user.planId = payment.planId;
      user.planName = payment.planName;
      user.billingCycle = payment.billingCycle;

      const plan = db.pricingPlans.find((pl) => pl.id === payment.planId);
      const durationDays =
        payment.billingCycle === 'yearly' ? 365 : plan?.durationDays || 30;
      user.subscriptionExpiresAt = new Date(Date.now() + durationDays * 86_400_000).toISOString();
      user.updatedAt = nowIso;

      const ctxId = `ctx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      db.creditTransactions.unshift({
        id: ctxId,
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName,
        previousBalance: prevCredits,
        amount: grant,
        newBalance,
        type: 'purchase',
        reason: `Payment approved (${payment.planName} · ${payment.billingCycle})`,
        note: `Tx ID: ${payment.transactionId}${adminNote ? ` — ${adminNote}` : ''}`,
        adminId: admin.id,
        adminEmail: admin.email,
        relatedPaymentId: payment.id,
        createdAt: nowIso,
      });

      payment.status = 'approved';
      payment.adminNote = adminNote || payment.adminNote;
      payment.reviewedByAdminId = admin.id;
      payment.reviewedByEmail = admin.email;
      payment.reviewedAt = nowIso;
      payment.creditTransactionId = ctxId;
      payment.updatedAt = nowIso;

      if (db.platformSettings.notifyUserOnPaymentDecision) {
        db.userNotifications.unshift({
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          userId: user.uid,
          title: 'Payment Approved & Plan Activated',
          message: `Your payment (${payment.transactionId}) for ${payment.planName} was approved. +${grant.toLocaleString()} credits added!`,
          type: 'success',
          read: false,
          createdAt: nowIso,
        });
      }

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'PAYMENT_APPROVED',
        targetType: 'payment_request',
        targetId: payment.id,
        previousValue: { status: 'pending', userCredits: prevCredits },
        newValue: {
          status: 'approved',
          amountUsd: payment.amountUsd,
          creditsGranted: grant,
          userCredits: newBalance,
          adminNote,
        },
        ipAddress: ip,
      });

      return { payment, user };
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.post('/payments/:id/reject', requirePermission('payments:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const rejectionReason = String(req.body?.rejectionReason || '').trim();
    const adminNote = String(req.body?.adminNote || '').trim();
    if (!rejectionReason) {
      return res.status(400).json({ success: false, error: 'A rejection reason is required.' });
    }

    const admin = req.adminAccount!;
    const ip = getClientIp(req);

    const payment = await runDbTransaction((db) => {
      const target = db.paymentRequests.find((p) => p.id === req.params.id);
      if (!target) throw Object.assign(new Error('Payment request not found.'), { statusCode: 404 });
      if (target.status !== 'pending') {
        throw Object.assign(new Error(`Payment request is already ${target.status}.`), { statusCode: 409 });
      }

      const nowIso = new Date().toISOString();
      target.status = 'rejected';
      target.rejectionReason = rejectionReason;
      if (adminNote) target.adminNote = adminNote;
      target.reviewedByAdminId = admin.id;
      target.reviewedByEmail = admin.email;
      target.reviewedAt = nowIso;
      target.updatedAt = nowIso;

      if (db.platformSettings.notifyUserOnPaymentDecision) {
        db.userNotifications.unshift({
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          userId: target.userId,
          title: 'Payment Request Declined',
          message: `Your payment (${target.transactionId}) was rejected: ${rejectionReason}`,
          type: 'error',
          read: false,
          createdAt: nowIso,
        });
      }

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'PAYMENT_REJECTED',
        targetType: 'payment_request',
        targetId: target.id,
        previousValue: { status: 'pending' },
        newValue: { status: 'rejected', rejectionReason, adminNote },
        ipAddress: ip,
      });

      return target;
    });

    res.json({ success: true, payment });
  } catch (err) {
    next(err);
  }
});

router.patch('/payments/:id/note', requirePermission('payments:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const adminNote = String(req.body?.adminNote || '').trim();
    const admin = req.adminAccount!;
    const ip = getClientIp(req);

    const payment = await runDbTransaction((db) => {
      const target = db.paymentRequests.find((p) => p.id === req.params.id);
      if (!target) throw Object.assign(new Error('Payment request not found.'), { statusCode: 404 });
      const prevNote = target.adminNote || '';
      target.adminNote = adminNote;
      target.updatedAt = new Date().toISOString();
      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'PAYMENT_NOTE_UPDATED',
        targetType: 'payment_request',
        targetId: target.id,
        previousValue: { adminNote: prevNote },
        newValue: { adminNote },
        ipAddress: ip,
      });
      return target;
    });

    res.json({ success: true, payment });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 6. Pricing Plans & Subscription Management
// ---------------------------------------------------------------------------
router.get('/plans', requirePermission('plans:view'), (_req: AuthenticatedAdminRequest, res: Response) => {
  const db = readDatabase();
  const plans = [...db.pricingPlans].sort((a, b) => a.displayOrder - b.displayOrder);
  res.json({ success: true, plans });
});

router.post('/plans', requirePermission('plans:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const { name, audience, monthlyPrice, yearlyPrice, credits, durationDays, features, isActive, isFeatured, displayOrder } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'Plan name is required.' });
    }
    const admin = req.adminAccount!;
    const ip = getClientIp(req);

    const created = await runDbTransaction((db) => {
      const now = new Date().toISOString();
      const newPlan: PricingPlanRecord = {
        id: `plan_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
        name: String(name).trim(),
        audience: String(audience || '').trim(),
        monthlyPrice: Math.max(0, Number(monthlyPrice) || 0),
        yearlyPrice: Math.max(0, Number(yearlyPrice) || 0),
        credits: Math.max(0, Math.round(Number(credits) || 0)),
        durationDays: Math.max(1, Math.round(Number(durationDays) || 30)),
        features: Array.isArray(features)
          ? features.map((f) => String(f).trim()).filter(Boolean)
          : String(features || '')
              .split('\n')
              .map((f) => f.trim())
              .filter(Boolean),
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        isFeatured: Boolean(isFeatured),
        displayOrder: Number(displayOrder) || db.pricingPlans.length + 1,
        createdAt: now,
        updatedAt: now,
      };
      db.pricingPlans.push(newPlan);

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'PLAN_CREATED',
        targetType: 'pricing_plan',
        targetId: newPlan.id,
        newValue: newPlan,
        ipAddress: ip,
      });

      return newPlan;
    });

    res.status(201).json({ success: true, plan: created });
  } catch (err) {
    next(err);
  }
});

router.patch('/plans/:id', requirePermission('plans:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const admin = req.adminAccount!;
    const ip = getClientIp(req);

    const updated = await runDbTransaction((db) => {
      const plan = db.pricingPlans.find((p) => p.id === req.params.id);
      if (!plan) throw Object.assign(new Error('Pricing plan not found.'), { statusCode: 404 });

      const prevSnapshot = { ...plan };
      const body = req.body || {};
      if (typeof body.name === 'string' && body.name.trim()) plan.name = body.name.trim();
      if (typeof body.audience === 'string') plan.audience = body.audience.trim();
      if (body.monthlyPrice !== undefined) plan.monthlyPrice = Math.max(0, Number(body.monthlyPrice) || 0);
      if (body.yearlyPrice !== undefined) plan.yearlyPrice = Math.max(0, Number(body.yearlyPrice) || 0);
      if (body.credits !== undefined) plan.credits = Math.max(0, Math.round(Number(body.credits) || 0));
      if (body.durationDays !== undefined) plan.durationDays = Math.max(1, Math.round(Number(body.durationDays) || 30));
      if (body.features !== undefined) {
        plan.features = Array.isArray(body.features)
          ? body.features.map((f: any) => String(f).trim()).filter(Boolean)
          : String(body.features)
              .split('\n')
              .map((f) => f.trim())
              .filter(Boolean);
      }
      if (body.isActive !== undefined) plan.isActive = Boolean(body.isActive);
      if (body.isFeatured !== undefined) plan.isFeatured = Boolean(body.isFeatured);
      if (body.displayOrder !== undefined) plan.displayOrder = Number(body.displayOrder) || plan.displayOrder;
      plan.updatedAt = new Date().toISOString();

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'PLAN_UPDATED',
        targetType: 'pricing_plan',
        targetId: plan.id,
        previousValue: prevSnapshot,
        newValue: plan,
        ipAddress: ip,
      });

      return plan;
    });

    res.json({ success: true, plan: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/plans/:id', requirePermission('plans:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const admin = req.adminAccount!;
    const ip = getClientIp(req);

    await runDbTransaction((db) => {
      if (db.pricingPlans.length <= 1) {
        throw Object.assign(new Error('Cannot delete the last remaining pricing plan.'), { statusCode: 400 });
      }
      const idx = db.pricingPlans.findIndex((p) => p.id === req.params.id);
      if (idx === -1) throw Object.assign(new Error('Pricing plan not found.'), { statusCode: 404 });
      const removed = db.pricingPlans[idx];
      db.pricingPlans.splice(idx, 1);

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'PLAN_DELETED',
        targetType: 'pricing_plan',
        targetId: removed.id,
        previousValue: { name: removed.name, monthlyPrice: removed.monthlyPrice },
        ipAddress: ip,
      });
    });

    res.json({ success: true, message: 'Pricing plan deleted.' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 7. AI Speech API & Integration Management (Encrypted Vault, Masked Output)
// ---------------------------------------------------------------------------
router.get('/integrations', requirePermission('api:view'), (_req: AuthenticatedAdminRequest, res: Response) => {
  const db = readDatabase();
  res.json({
    success: true,
    integrations: db.apiIntegrations.map(sanitizeIntegration),
  });
});

router.post('/integrations', requirePermission('api:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const { providerName, providerType, endpointUrl, modelName, apiKey, isEnabled, isPrimary, rateLimitPerMin } = req.body || {};
    if (!providerName || !endpointUrl || !apiKey) {
      return res.status(400).json({ success: false, error: 'Provider name, endpoint URL, and API key are required.' });
    }
    const admin = req.adminAccount!;
    const ip = getClientIp(req);

    const created = await runDbTransaction((db) => {
      const now = new Date().toISOString();
      const setPrimary = Boolean(isPrimary);
      if (setPrimary) {
        db.apiIntegrations.forEach((i) => {
          i.isPrimary = false;
        });
      }
      const cleanKey = String(apiKey).trim();
      const rec: ApiIntegrationRecord = {
        id: `int_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        providerName: String(providerName).trim(),
        providerType: ['openspeaker', 'elevenlabs', 'custom'].includes(providerType) ? providerType : 'custom',
        endpointUrl: String(endpointUrl).trim().replace(/\/+$/, ''),
        modelName: String(modelName || 'eleven_multilingual_v2').trim(),
        encryptedApiKey: encryptSecret(cleanKey),
        maskedKey: maskApiKey(cleanKey),
        isEnabled: isEnabled !== undefined ? Boolean(isEnabled) : true,
        isPrimary: setPrimary,
        rateLimitPerMin: Math.max(1, Number(rateLimitPerMin) || 60),
        usageCount: 0,
        totalEstimatedCostUsd: 0,
        lastTestedAt: null,
        lastStatus: 'untested',
        lastStatusMessage: 'Newly added credential (untested)',
        recentErrors: [],
        createdAt: now,
        updatedAt: now,
      };
      db.apiIntegrations.push(rec);

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'API_INTEGRATION_CREATED',
        targetType: 'api_integration',
        targetId: rec.id,
        newValue: { providerName: rec.providerName, endpointUrl: rec.endpointUrl, maskedKey: rec.maskedKey },
        ipAddress: ip,
      });

      return sanitizeIntegration(rec);
    });

    invalidateVoiceCache();
    res.status(201).json({ success: true, integration: created });
  } catch (err) {
    next(err);
  }
});

router.patch('/integrations/:id', requirePermission('api:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const admin = req.adminAccount!;
    const ip = getClientIp(req);
    const body = req.body || {};

    const updated = await runDbTransaction((db) => {
      const rec = db.apiIntegrations.find((i) => i.id === req.params.id);
      if (!rec) throw Object.assign(new Error('API integration not found.'), { statusCode: 404 });

      const prevMasked = rec.maskedKey;
      const prevEndpoint = rec.endpointUrl;
      const prevEnabled = rec.isEnabled;

      if (typeof body.providerName === 'string' && body.providerName.trim()) {
        rec.providerName = body.providerName.trim();
      }
      if (typeof body.endpointUrl === 'string' && body.endpointUrl.trim()) {
        rec.endpointUrl = body.endpointUrl.trim().replace(/\/+$/, '');
      }
      if (typeof body.modelName === 'string' && body.modelName.trim()) {
        rec.modelName = body.modelName.trim();
      }
      if (body.rateLimitPerMin !== undefined) {
        rec.rateLimitPerMin = Math.max(1, Number(body.rateLimitPerMin) || 60);
      }
      if (body.isEnabled !== undefined) {
        rec.isEnabled = Boolean(body.isEnabled);
      }
      if (body.isPrimary === true) {
        db.apiIntegrations.forEach((i) => {
          i.isPrimary = false;
        });
        rec.isPrimary = true;
      } else if (body.isPrimary === false) {
        rec.isPrimary = false;
      }
      if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
        const cleanKey = body.apiKey.trim();
        rec.encryptedApiKey = encryptSecret(cleanKey);
        rec.maskedKey = maskApiKey(cleanKey);
        rec.lastStatus = 'untested';
        rec.lastStatusMessage = 'Key rotated; run connection test to verify';
      }
      rec.updatedAt = new Date().toISOString();

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'API_INTEGRATION_UPDATED',
        targetType: 'api_integration',
        targetId: rec.id,
        previousValue: { endpointUrl: prevEndpoint, isEnabled: prevEnabled, maskedKey: prevMasked },
        newValue: {
          endpointUrl: rec.endpointUrl,
          isEnabled: rec.isEnabled,
          isPrimary: rec.isPrimary,
          maskedKey: rec.maskedKey,
        },
        ipAddress: ip,
      });

      return sanitizeIntegration(rec);
    });

    invalidateVoiceCache();
    res.json({ success: true, integration: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/integrations/:id', requirePermission('api:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const admin = req.adminAccount!;
    const ip = getClientIp(req);

    await runDbTransaction((db) => {
      const idx = db.apiIntegrations.findIndex((i) => i.id === req.params.id);
      if (idx === -1) throw Object.assign(new Error('API integration not found.'), { statusCode: 404 });
      const removed = db.apiIntegrations[idx];
      db.apiIntegrations.splice(idx, 1);

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'API_INTEGRATION_DELETED',
        targetType: 'api_integration',
        targetId: removed.id,
        previousValue: { providerName: removed.providerName, maskedKey: removed.maskedKey },
        ipAddress: ip,
      });
    });

    invalidateVoiceCache();
    res.json({ success: true, message: 'API integration deleted.' });
  } catch (err) {
    next(err);
  }
});

router.post('/integrations/:id/test', requirePermission('api:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const db = readDatabase();
    const target = db.apiIntegrations.find((i) => i.id === req.params.id);
    if (!target) throw Object.assign(new Error('API integration not found.'), { statusCode: 404 });

    const decryptedKey = decryptSecret(target.encryptedApiKey);
    if (!decryptedKey) {
      return res.status(400).json({ success: false, error: 'No API key stored for this integration.' });
    }

    const nowIso = new Date().toISOString();
    try {
      const healthPayload = await openspeakerRequest({
        method: 'GET',
        path: '/v1/health-check',
        timeoutMs: 9000,
        maxRetries: 0,
        overrideConfig: {
          integrationId: target.id,
          apiBaseUrl: target.endpointUrl,
          apiKey: decryptedKey,
        },
      });

      const updated = await runDbTransaction((txDb) => {
        const rec = txDb.apiIntegrations.find((i) => i.id === target.id)!;
        rec.lastStatus = 'connected';
        rec.lastTestedAt = nowIso;
        rec.lastStatusMessage = 'Connection verified successfully.';
        rec.updatedAt = nowIso;
        recordAuditLog(txDb, {
          adminId: req.adminAccount!.id,
          adminEmail: req.adminAccount!.email,
          adminRole: req.adminAccount!.role,
          action: 'API_INTEGRATION_TESTED',
          targetType: 'api_integration',
          targetId: rec.id,
          newValue: { status: 'connected' },
          ipAddress: getClientIp(req),
        });
        return sanitizeIntegration(rec);
      });

      res.json({ success: true, integration: updated, upstreamHealth: healthPayload });
    } catch (testErr: any) {
      const updated = await runDbTransaction((txDb) => {
        const rec = txDb.apiIntegrations.find((i) => i.id === target.id)!;
        rec.lastStatus = testErr.statusCode === 503 || testErr.statusCode === 429 ? 'degraded' : 'error';
        rec.lastTestedAt = nowIso;
        rec.lastStatusMessage = testErr.message || 'Connection test failed';
        rec.updatedAt = nowIso;
        return sanitizeIntegration(rec);
      });

      res.status(200).json({
        success: false,
        error: testErr.message || 'Connection test failed.',
        integration: updated,
      });
    }
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 8. Projects Management
// ---------------------------------------------------------------------------
router.get('/projects', requirePermission('projects:view'), (req: AuthenticatedAdminRequest, res: Response) => {
  const db = readDatabase();
  const q = String(req.query.q || '').trim().toLowerCase();
  const statusFilter = String(req.query.status || 'all');

  let projects = db.projects.map((p) => {
    const linkedGenerations = db.speechHistory.filter((s) => s.projectId === p.id);
    return {
      ...p,
      generationsCount: linkedGenerations.length,
    };
  });

  if (q) {
    projects = projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.userEmail || '').toLowerCase().includes(q) ||
        (p.userName || '').toLowerCase().includes(q)
    );
  }
  if (statusFilter !== 'all') {
    projects = projects.filter((p) => p.status === statusFilter);
  }

  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  res.json({ success: true, projects });
});

router.get('/projects/:id', requirePermission('projects:view'), (req: AuthenticatedAdminRequest, res: Response) => {
  const db = readDatabase();
  const project = db.projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found.' });
  const generations = db.speechHistory.filter((s) => s.projectId === project.id);
  res.json({ success: true, project, generations });
});

router.delete('/projects/:id', requirePermission('projects:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const admin = req.adminAccount!;
    const ip = getClientIp(req);
    await runDbTransaction((db) => {
      const idx = db.projects.findIndex((p) => p.id === req.params.id);
      if (idx === -1) throw Object.assign(new Error('Project not found.'), { statusCode: 404 });
      const removed = db.projects[idx];
      db.projects.splice(idx, 1);

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'PROJECT_DELETED',
        targetType: 'project',
        targetId: removed.id,
        previousValue: { name: removed.name, userId: removed.userId },
        ipAddress: ip,
      });
    });

    res.json({ success: true, message: 'Project deleted.' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 9. Speech History Management
// ---------------------------------------------------------------------------
router.get('/speech-history', requirePermission('history:view'), (req: AuthenticatedAdminRequest, res: Response) => {
  const db = readDatabase();
  const q = String(req.query.q || '').trim().toLowerCase();
  const statusFilter = String(req.query.status || 'all');

  let items = [...db.speechHistory];
  if (q) {
    items = items.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.taskId.toLowerCase().includes(q) ||
        s.voiceName.toLowerCase().includes(q) ||
        (s.userEmail || '').toLowerCase().includes(q) ||
        s.text.toLowerCase().includes(q)
    );
  }
  if (statusFilter !== 'all') {
    items = items.filter((s) => s.status === statusFilter);
  }

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ success: true, history: items });
});

router.delete('/speech-history/:id', requirePermission('history:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const admin = req.adminAccount!;
    const ip = getClientIp(req);
    await runDbTransaction((db) => {
      const idx = db.speechHistory.findIndex((s) => s.id === req.params.id);
      if (idx === -1) throw Object.assign(new Error('Speech generation record not found.'), { statusCode: 404 });
      const removed = db.speechHistory[idx];
      db.speechHistory.splice(idx, 1);

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'SPEECH_HISTORY_DELETED',
        targetType: 'speech_history',
        targetId: removed.id,
        previousValue: { voiceName: removed.voiceName, userId: removed.userId, taskId: removed.taskId },
        ipAddress: ip,
      });
    });
    res.json({ success: true, message: 'Speech history record deleted.' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 10. Voice Library Management
// ---------------------------------------------------------------------------
router.get('/voices', requirePermission('voices:view'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const catalog = await fetchVoiceCatalog(forceRefresh);
    const db = readDatabase();
    const managed = mergeVoicesWithOverrides(catalog.voices, db.voiceOverrides, true);
    res.json({
      success: true,
      voices: managed,
      totalCount: managed.length,
      disabledCount: managed.filter((v) => !v.enabled).length,
      customCount: managed.filter((v) => v.isCustomAdded).length,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/voices', requirePermission('voices:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const { voiceId, name, category, language, accent, gender, description, previewUrl, allowedPlans } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'Voice name is required.' });
    }
    const id = (voiceId ? String(voiceId).trim() : '') || `custom_voice_${Date.now()}`;
    const admin = req.adminAccount!;
    const ip = getClientIp(req);

    const override = await runDbTransaction((db) => {
      if (db.voiceOverrides.some((v) => v.voiceId === id)) {
        throw Object.assign(new Error('A voice override with this ID already exists.'), { statusCode: 409 });
      }
      const record = {
        voiceId: id,
        enabled: true,
        customName: String(name).trim(),
        customCategory: category ? String(category).trim() : 'custom',
        customLanguage: language ? String(language).trim() : 'English',
        customAccent: accent ? String(accent).trim() : '',
        customGender: gender ? String(gender).trim() : '',
        customDescription: description ? String(description).trim() : '',
        customPreviewUrl: previewUrl ? String(previewUrl).trim() : '',
        allowedPlans: Array.isArray(allowedPlans) ? allowedPlans : [],
        isCustomAdded: true,
        updatedAt: new Date().toISOString(),
      };
      db.voiceOverrides.unshift(record);
      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'VOICE_CREATED',
        targetType: 'voice',
        targetId: record.voiceId,
        newValue: record,
        ipAddress: ip,
      });
      return record;
    });

    res.status(201).json({ success: true, voice: override });
  } catch (err) {
    next(err);
  }
});

router.put('/voices/:voiceId', requirePermission('voices:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const voiceId = req.params.voiceId;
    const body = req.body || {};
    const admin = req.adminAccount!;
    const ip = getClientIp(req);

    const override = await runDbTransaction((db) => {
      let existing = db.voiceOverrides.find((v) => v.voiceId === voiceId);
      const prev = existing ? { ...existing } : null;

      if (!existing) {
        existing = {
          voiceId,
          enabled: true,
          allowedPlans: [],
          isCustomAdded: false,
          updatedAt: new Date().toISOString(),
        };
        db.voiceOverrides.push(existing);
      }

      if (body.enabled !== undefined) existing.enabled = Boolean(body.enabled);
      if (typeof body.customName === 'string') existing.customName = body.customName.trim() || undefined;
      if (typeof body.customCategory === 'string') existing.customCategory = body.customCategory.trim() || undefined;
      if (typeof body.customLanguage === 'string') existing.customLanguage = body.customLanguage.trim() || undefined;
      if (typeof body.customAccent === 'string') existing.customAccent = body.customAccent.trim() || undefined;
      if (typeof body.customGender === 'string') existing.customGender = body.customGender.trim() || undefined;
      if (typeof body.customDescription === 'string') existing.customDescription = body.customDescription.trim() || undefined;
      if (typeof body.customPreviewUrl === 'string') existing.customPreviewUrl = body.customPreviewUrl.trim() || undefined;
      if (Array.isArray(body.allowedPlans)) existing.allowedPlans = body.allowedPlans;
      existing.updatedAt = new Date().toISOString();

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'VOICE_UPDATED',
        targetType: 'voice',
        targetId: voiceId,
        previousValue: prev,
        newValue: existing,
        ipAddress: ip,
      });

      return existing;
    });

    res.json({ success: true, override });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 11. Platform Settings
// ---------------------------------------------------------------------------
router.get('/settings', requirePermission('settings:view'), (_req: AuthenticatedAdminRequest, res: Response) => {
  const db = readDatabase();
  res.json({ success: true, settings: db.platformSettings });
});

router.put('/settings', requirePermission('settings:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const body = req.body || {};
    const admin = req.adminAccount!;
    const ip = getClientIp(req);

    const updated = await runDbTransaction((db) => {
      const prev = { ...db.platformSettings };
      const s = db.platformSettings;

      if (typeof body.siteName === 'string' && body.siteName.trim()) s.siteName = body.siteName.trim();
      if (typeof body.logoUrl === 'string') s.logoUrl = body.logoUrl.trim();
      if (typeof body.faviconUrl === 'string') s.faviconUrl = body.faviconUrl.trim();
      if (typeof body.supportEmail === 'string') s.supportEmail = body.supportEmail.trim();
      if (typeof body.contactInfo === 'string') s.contactInfo = body.contactInfo.trim();
      if (body.defaultCredits !== undefined) s.defaultCredits = Math.max(0, Math.round(Number(body.defaultCredits) || 0));
      if (body.signupBonusEnabled !== undefined) s.signupBonusEnabled = Boolean(body.signupBonusEnabled);
      if (body.signupBonusCredits !== undefined) {
        s.signupBonusCredits = Math.max(0, Math.round(Number(body.signupBonusCredits) || 0));
      }
      if (typeof body.defaultPlanId === 'string' && body.defaultPlanId.trim()) s.defaultPlanId = body.defaultPlanId.trim();
      if (body.allowRegistration !== undefined) s.allowRegistration = Boolean(body.allowRegistration);
      if (body.creditCostPer1kChars !== undefined) {
        s.creditCostPer1kChars = Math.max(1, Math.round(Number(body.creditCostPer1kChars) || 65));
      }
      if (body.transcriptSurchargePercent !== undefined) {
        const parsedPct = Number(body.transcriptSurchargePercent);
        s.transcriptSurchargePercent = Number.isFinite(parsedPct)
          ? Math.max(0, Math.min(200, Math.round(parsedPct)))
          : 25;
      }
      if (typeof body.paymentInstructions === 'string') s.paymentInstructions = body.paymentInstructions.trim();
      if (Array.isArray(body.acceptedPaymentMethods)) {
        s.acceptedPaymentMethods = body.acceptedPaymentMethods.map((m: any) => String(m).trim()).filter(Boolean);
      }
      if (body.notifyAdminOnNewPayment !== undefined) s.notifyAdminOnNewPayment = Boolean(body.notifyAdminOnNewPayment);
      if (body.notifyUserOnPaymentDecision !== undefined) {
        s.notifyUserOnPaymentDecision = Boolean(body.notifyUserOnPaymentDecision);
      }
      if (body.maxTextChars !== undefined) {
        s.maxTextChars = Math.max(500, Math.min(200000, Math.round(Number(body.maxTextChars) || 50000)));
      }
      if (Array.isArray(body.supportedLanguages)) {
        s.supportedLanguages = body.supportedLanguages.map((l: any) => String(l).trim()).filter(Boolean);
      }
      if (body.maintenanceMode !== undefined) s.maintenanceMode = Boolean(body.maintenanceMode);
      if (typeof body.maintenanceMessage === 'string') s.maintenanceMessage = body.maintenanceMessage.trim();

      s.updatedAt = new Date().toISOString();

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'PLATFORM_SETTINGS_UPDATED',
        targetType: 'platform_settings',
        targetId: 'global',
        previousValue: prev,
        newValue: s,
        ipAddress: ip,
      });

      return s;
    });

    res.json({ success: true, settings: updated });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 12. Immutable Admin Activity & Audit Logs (Read-Only)
// ---------------------------------------------------------------------------
router.get('/audit-logs', requirePermission('audit:view'), (req: AuthenticatedAdminRequest, res: Response) => {
  const db = readDatabase();
  const q = String(req.query.q || '').trim().toLowerCase();
  const actionFilter = String(req.query.action || 'all');

  let logs = [...db.auditLogs];
  if (q) {
    logs = logs.filter(
      (l) =>
        l.adminEmail.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.targetType.toLowerCase().includes(q) ||
        l.targetId.toLowerCase().includes(q)
    );
  }
  if (actionFilter !== 'all') {
    logs = logs.filter((l) => l.action === actionFilter);
  }

  res.json({
    success: true,
    logs: logs.slice(0, 500),
    total: logs.length,
  });
});

// ---------------------------------------------------------------------------
// 13. Admin Accounts & RBAC Permissions (Super Admin Controlled)
// ---------------------------------------------------------------------------
router.get('/accounts', requirePermission('admins:view'), (_req: AuthenticatedAdminRequest, res: Response) => {
  const db = readDatabase();
  res.json({
    success: true,
    accounts: db.adminAccounts.map(sanitizeAdminAccount),
    roleTemplates: ROLE_PERMISSIONS_MAP,
  });
});

router.post('/accounts', requirePermission('admins:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const { email, name, role, permissions, initialPassword } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const validRoles: AdminRole[] = ['Super Admin', 'Finance Manager', 'Support Manager', 'Content Manager'];

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, error: 'A valid administrator email is required.' });
    }
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid administrator role selected.' });
    }
    const pwdErr = validatePasswordStrength(initialPassword);
    if (pwdErr) {
      return res.status(400).json({ success: false, error: pwdErr });
    }

    const admin = req.adminAccount!;
    const ip = getClientIp(req);

    const created = await runDbTransaction((db) => {
      if (db.adminAccounts.some((a) => a.email.toLowerCase() === cleanEmail)) {
        throw Object.assign(new Error('An administrator account with this email already exists.'), {
          statusCode: 409,
        });
      }
      const now = new Date().toISOString();
      const { hash, salt } = hashPassword(initialPassword);
      const resolvedPerms: AdminPermission[] =
        Array.isArray(permissions) && permissions.length > 0
          ? permissions
          : [...ROLE_PERMISSIONS_MAP[role as AdminRole]];

      const newAdmin = {
        id: `adm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        email: cleanEmail,
        name: String(name || cleanEmail.split('@')[0]).trim(),
        role: role as AdminRole,
        permissions: resolvedPerms,
        passwordHash: hash,
        passwordSalt: salt,
        isActive: true,
        mustChangePassword: false,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      };
      db.adminAccounts.push(newAdmin);

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'ADMIN_ACCOUNT_CREATED',
        targetType: 'admin_account',
        targetId: newAdmin.id,
        newValue: { email: newAdmin.email, role: newAdmin.role, permissions: newAdmin.permissions },
        ipAddress: ip,
      });

      return sanitizeAdminAccount(newAdmin);
    });

    res.status(201).json({ success: true, account: created });
  } catch (err) {
    next(err);
  }
});

router.patch('/accounts/:id', requirePermission('admins:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const { name, role, permissions, isActive } = req.body || {};
    const admin = req.adminAccount!;
    const ip = getClientIp(req);

    const updated = await runDbTransaction((db) => {
      const target = db.adminAccounts.find((a) => a.id === req.params.id);
      if (!target) throw Object.assign(new Error('Administrator account not found.'), { statusCode: 404 });

      const prev = sanitizeAdminAccount(target);

      const activeSuperAdmins = db.adminAccounts.filter(
        (a) => a.role === 'Super Admin' && a.isActive
      );

      if (
        target.role === 'Super Admin' &&
        target.isActive &&
        activeSuperAdmins.length <= 1 &&
        (isActive === false || (role && role !== 'Super Admin'))
      ) {
        throw Object.assign(
          new Error('Cannot deactivate or demote the last active Super Admin account.'),
          { statusCode: 400 }
        );
      }

      if (typeof name === 'string' && name.trim()) target.name = name.trim();
      if (role && ['Super Admin', 'Finance Manager', 'Support Manager', 'Content Manager'].includes(role)) {
        target.role = role as AdminRole;
      }
      if (Array.isArray(permissions)) {
        target.permissions = permissions;
      }
      if (isActive !== undefined) {
        target.isActive = Boolean(isActive);
        if (!target.isActive) {
          db.adminSessions = db.adminSessions.filter((s) => s.adminId !== target.id);
        }
      }
      target.updatedAt = new Date().toISOString();

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'ADMIN_ACCOUNT_UPDATED',
        targetType: 'admin_account',
        targetId: target.id,
        previousValue: prev,
        newValue: sanitizeAdminAccount(target),
        ipAddress: ip,
      });

      return sanitizeAdminAccount(target);
    });

    res.json({ success: true, account: updated });
  } catch (err) {
    next(err);
  }
});

router.post('/accounts/:id/reset-password', requirePermission('admins:manage'), async (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  try {
    const { newPassword } = req.body || {};
    const pwdErr = validatePasswordStrength(newPassword);
    if (pwdErr) return res.status(400).json({ success: false, error: pwdErr });

    const admin = req.adminAccount!;
    const ip = getClientIp(req);

    await runDbTransaction((db) => {
      const target = db.adminAccounts.find((a) => a.id === req.params.id);
      if (!target) throw Object.assign(new Error('Administrator account not found.'), { statusCode: 404 });

      const { hash, salt } = hashPassword(newPassword);
      target.passwordHash = hash;
      target.passwordSalt = salt;
      target.mustChangePassword = false;
      target.updatedAt = new Date().toISOString();
      db.adminSessions = db.adminSessions.filter((s) => s.adminId !== target.id);

      recordAuditLog(db, {
        adminId: admin.id,
        adminEmail: admin.email,
        adminRole: admin.role,
        action: 'ADMIN_ACCOUNT_PASSWORD_RESET',
        targetType: 'admin_account',
        targetId: target.id,
        newValue: { targetEmail: target.email },
        ipAddress: ip,
      });
    });

    res.json({ success: true, message: 'Administrator password has been updated cleanly.' });
  } catch (err) {
    next(err);
  }
});

export default router;
