import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { readDatabase, runDbTransaction } from '../db/database.js';
import { verifyFirebaseIdToken, VerifiedFirebaseUser } from '../services/firebaseTokenVerifier.js';
import { resolveActiveApiConfig } from '../services/openspeakerClient.js';
import { DbUser } from '../types/admin.js';
import { DEFAULT_CREDIT_COST_PER_1K_CHARS } from '../../shared/creditPricing.js';

const router = express.Router();

export interface UserAuthenticatedRequest extends Request {
  firebaseUser?: VerifiedFirebaseUser;
}

export async function optionalFirebaseUser(req: Request): Promise<VerifiedFirebaseUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    return await verifyFirebaseIdToken(token);
  } catch {
    return null;
  }
}

async function requireFirebaseUser(
  req: UserAuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication Bearer token required.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  try {
    const verified = await verifyFirebaseIdToken(token);
    if (!verified) {
      res.status(401).json({ success: false, error: 'Invalid or expired authentication token.' });
      return;
    }
    req.firebaseUser = verified;
    next();
  } catch (err: any) {
    res.status(401).json({ success: false, error: err.message || 'Invalid or expired authentication token.' });
  }
}

// ---------------------------------------------------------------------------
// Public Bootstrap (Dynamic Plans, Branding, Settings, Maintenance Status)
// ---------------------------------------------------------------------------
router.get('/public/bootstrap', (_req: Request, res: Response) => {
  const db = readDatabase();
  const s = db.platformSettings;
  const activePlans = [...db.pricingPlans]
    .filter((p) => p.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const apiCfg = resolveActiveApiConfig();

  res.json({
    success: true,
    isConfigured: apiCfg.configured,
    plans: activePlans,
    settings: {
      siteName: s.siteName,
      logoUrl: s.logoUrl,
      faviconUrl: s.faviconUrl,
      supportEmail: s.supportEmail,
      contactInfo: s.contactInfo,
      defaultCredits: 0,
      defaultPlanId: s.defaultPlanId,
      allowRegistration: s.allowRegistration,
      signupBonusEnabled: s.signupBonusEnabled ?? true,
      signupBonusCredits: s.signupBonusCredits ?? 5000,
      creditCostPer1kChars: DEFAULT_CREDIT_COST_PER_1K_CHARS,
      transcriptSurchargePercent: s.transcriptSurchargePercent ?? 25,
      paymentInstructions: s.paymentInstructions,
      acceptedPaymentMethods: s.acceptedPaymentMethods,
      maxTextChars: s.maxTextChars,
      supportedLanguages: s.supportedLanguages,
      maintenanceMode: s.maintenanceMode,
      maintenanceMessage: s.maintenanceMessage,
    },
    voiceOverrides: db.voiceOverrides,
  });
});

// ---------------------------------------------------------------------------
// User Profile Sync & Workspace Hydration (Atomic One-Time Google Bonus)
// ---------------------------------------------------------------------------
router.post('/user/sync', requireFirebaseUser, async (req: UserAuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const fbUser = req.firebaseUser!;
    const guestProjects = Array.isArray(req.body?.guestProjects) ? req.body.guestProjects : [];

    const payload = await runDbTransaction((db) => {
      const nowIso = new Date().toISOString();
      const primaryGoogleId = fbUser.googleSub || (fbUser.isGoogleAuth ? fbUser.uid : undefined);

      // Find user either by Firebase UID or immutable Google Account identifier (sub)
      let user = db.users.find(
        (u) => u.uid === fbUser.uid || (primaryGoogleId && u.googleSub === primaryGoogleId)
      );

      let isNewUser = false;
      let bonusAwarded = false;
      let bonusAmount = 0;
      let welcomeMessage: string | null = null;

      if (!user) {
        if (!db.platformSettings.allowRegistration) {
          throw Object.assign(
            new Error('New user registrations are currently paused by the administrator.'),
            { statusCode: 403 }
          );
        }

        isNewUser = true;
        const defaultPlan =
          db.pricingPlans.find((p) => p.id === db.platformSettings.defaultPlanId) ||
          db.pricingPlans[0];

        // Check permanent claim registry using immutable Google sub (survives account deletion)
        const existingClaim = primaryGoogleId
          ? db.welcomeBonusClaims.find((c) => c.googleSub === primaryGoogleId)
          : undefined;

        const configuredBonus = Math.max(
          0,
          Math.round(db.platformSettings.signupBonusCredits ?? 5000)
        );
        const qualifiesForWelcomeBonus = Boolean(
          fbUser.isGoogleAuth &&
            fbUser.emailVerified &&
            primaryGoogleId &&
            (db.platformSettings.signupBonusEnabled ?? true) &&
            configuredBonus > 0 &&
            !existingClaim
        );

        const initialCredits = qualifiesForWelcomeBonus ? configuredBonus : 0;

        const newUser: DbUser = {
          uid: fbUser.uid,
          email: fbUser.email || '',
          displayName: fbUser.name || (fbUser.email ? fbUser.email.split('@')[0] : 'Speakly Creator'),
          avatarUrl: fbUser.picture || '',
          status: 'active',
          planId: defaultPlan?.id || 'plan_starter',
          planName: defaultPlan?.name || 'Starter',
          billingCycle: 'monthly',
          subscriptionExpiresAt: null,
          remainingCredits: initialCredits,
          totalPurchasedCredits: 0,
          totalConsumedCredits: 0,
          defaultLanguage: db.platformSettings.supportedLanguages[0] || 'English',
          defaultSpeed: 1.0,
          notifyOnComplete: true,
          notifyAccountAlerts: true,
          authProvider: fbUser.isGoogleAuth ? 'google' : 'other',
          googleSub: primaryGoogleId,
          welcomeBonusClaimed: qualifiesForWelcomeBonus,
          welcomeBonusAmount: qualifiesForWelcomeBonus ? initialCredits : 0,
          welcomeBonusAwardedAt: qualifiesForWelcomeBonus ? nowIso : null,
          createdAt: nowIso,
          updatedAt: nowIso,
          lastLoginAt: nowIso,
        };
        db.users.unshift(newUser);
        user = newUser;

        if (qualifiesForWelcomeBonus && primaryGoogleId) {
          bonusAwarded = true;
          bonusAmount = initialCredits;
          welcomeMessage = `Welcome to Speakly Studio! You've received ${bonusAmount.toLocaleString()} free credits. Start creating amazing AI voices!`;

          const txId = `ctx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
          db.creditTransactions.unshift({
            id: txId,
            userId: user.uid,
            userEmail: user.email,
            userName: user.displayName,
            googleSub: primaryGoogleId,
            previousBalance: 0,
            amount: bonusAmount,
            newBalance: bonusAmount,
            type: 'signup_bonus',
            reason: 'Google Sign-Up Welcome Bonus',
            note: `Immutable Google ID: ${primaryGoogleId}`,
            createdAt: nowIso,
          });

          db.welcomeBonusClaims.unshift({
            googleSub: primaryGoogleId,
            userId: user.uid,
            email: user.email,
            amountAwarded: bonusAmount,
            creditTransactionId: txId,
            claimedAt: nowIso,
          });

          db.userNotifications.unshift({
            id: `notif_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
            userId: user.uid,
            title: 'Welcome to Speakly Studio!',
            message: welcomeMessage,
            type: 'success',
            read: false,
            createdAt: nowIso,
          });
        } else if (existingClaim) {
          db.userNotifications.unshift({
            id: `notif_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
            userId: user.uid,
            title: 'Account Ready',
            message:
              'Your Google account was registered. Note: the one-time welcome credit bonus was already claimed previously for this Google identity.',
            type: 'info',
            read: false,
            createdAt: nowIso,
          });
        }

        // Migrate any local draft scripts on first signup if user has none yet
        for (const gp of guestProjects.slice(0, 20)) {
          if (!gp || !gp.name || !gp.script) continue;
          db.projects.unshift({
            id: gp.id || `proj_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
            userId: user.uid,
            userEmail: user.email,
            userName: user.displayName,
            name: String(gp.name).slice(0, 120),
            description: String(gp.description || '').slice(0, 400),
            script: String(gp.script).slice(0, 60000),
            voiceId: gp.voiceId,
            voiceName: gp.voiceName,
            speed: gp.speed,
            withTranscript: Boolean(gp.withTranscript),
            fileName: gp.fileName,
            status: 'active',
            createdAt: gp.createdAt || nowIso,
            updatedAt: gp.updatedAt || nowIso,
          });
        }
      } else {
        if (user.status === 'suspended') {
          throw Object.assign(
            new Error('Your account has been suspended by an administrator. Contact support for assistance.'),
            { statusCode: 403 }
          );
        }
        // Existing account: preserve balance strictly (no retroactive/duplicate bonus)
        user.lastLoginAt = nowIso;
        if (fbUser.picture) user.avatarUrl = fbUser.picture;
        if (fbUser.name && !user.displayName) user.displayName = fbUser.name;
        if (fbUser.isGoogleAuth && !user.authProvider) user.authProvider = 'google';
        if (primaryGoogleId && !user.googleSub) user.googleSub = primaryGoogleId;
        user.updatedAt = nowIso;
      }

      const projects = db.projects.filter((p) => p.userId === user!.uid);
      const speechHistory = db.speechHistory
        .filter((s) => s.userId === user!.uid)
        .slice(0, 100)
        .map((s) =>
          s.withTranscript && s.hasTranscript && s.status === 'completed' && s.transcriptData
            ? s
            : { ...s, hasTranscript: false, transcriptData: undefined }
        );
      const creditTransactions = db.creditTransactions.filter((c) => c.userId === user!.uid).slice(0, 50);
      const paymentRequests = db.paymentRequests.filter((p) => p.userId === user!.uid).slice(0, 30);
      const notifications = db.userNotifications.filter((n) => n.userId === user!.uid).slice(0, 30);

      return {
        isNewUser,
        bonusAwarded,
        bonusAmount,
        welcomeMessage,
        user,
        projects,
        speechHistory,
        creditTransactions,
        paymentRequests,
        notifications,
      };
    });

    res.json({ success: true, ...payload });
  } catch (err) {
    next(err);
  }
});

router.patch('/user/profile', requireFirebaseUser, async (req: UserAuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const uid = req.firebaseUser!.uid;
    const { displayName, defaultLanguage, defaultSpeed, notifyOnComplete, notifyAccountAlerts } = req.body || {};

    const user = await runDbTransaction((db) => {
      const target = db.users.find((u) => u.uid === uid);
      if (!target) throw Object.assign(new Error('User record not found.'), { statusCode: 404 });
      if (target.status === 'suspended') throw Object.assign(new Error('Account suspended.'), { statusCode: 403 });

      if (typeof displayName === 'string' && displayName.trim()) target.displayName = displayName.trim().slice(0, 80);
      if (typeof defaultLanguage === 'string' && defaultLanguage.trim()) target.defaultLanguage = defaultLanguage.trim();
      if (defaultSpeed !== undefined && Number(defaultSpeed) >= 0.5 && Number(defaultSpeed) <= 1.5) {
        target.defaultSpeed = Number(defaultSpeed);
      }
      if (notifyOnComplete !== undefined) target.notifyOnComplete = Boolean(notifyOnComplete);
      if (notifyAccountAlerts !== undefined) target.notifyAccountAlerts = Boolean(notifyAccountAlerts);
      target.updatedAt = new Date().toISOString();
      return target;
    });

    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Authenticated User Projects CRUD
// ---------------------------------------------------------------------------
router.post('/user/projects', requireFirebaseUser, async (req: UserAuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const uid = req.firebaseUser!.uid;
    const { id, name, description, script, voiceId, voiceName, speed, withTranscript, fileName } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'Project name is required.' });
    }

    const project = await runDbTransaction((db) => {
      const user = db.users.find((u) => u.uid === uid);
      if (!user) throw Object.assign(new Error('User profile not synced yet.'), { statusCode: 404 });
      if (user.status === 'suspended') throw Object.assign(new Error('Account suspended.'), { statusCode: 403 });

      const nowIso = new Date().toISOString();
      const existing = id ? db.projects.find((p) => p.id === id && p.userId === uid) : undefined;
      if (existing) {
        existing.name = String(name).trim();
        existing.description = String(description || '').trim();
        existing.script = String(script || '');
        existing.voiceId = voiceId;
        existing.voiceName = voiceName;
        existing.speed = speed;
        existing.withTranscript = Boolean(withTranscript);
        existing.fileName = fileName;
        existing.updatedAt = nowIso;
        return existing;
      }

      const created = {
        id: id || `proj_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
        userId: uid,
        userEmail: user.email,
        userName: user.displayName,
        name: String(name).trim(),
        description: String(description || '').trim(),
        script: String(script || ''),
        voiceId,
        voiceName,
        speed,
        withTranscript: Boolean(withTranscript),
        fileName,
        status: 'active' as const,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      db.projects.unshift(created);
      return created;
    });

    res.json({ success: true, project });
  } catch (err) {
    next(err);
  }
});

router.delete('/user/projects/:id', requireFirebaseUser, async (req: UserAuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const uid = req.firebaseUser!.uid;
    await runDbTransaction((db) => {
      const idx = db.projects.findIndex((p) => p.id === req.params.id && p.userId === uid);
      if (idx === -1) throw Object.assign(new Error('Project not found.'), { statusCode: 404 });
      db.projects.splice(idx, 1);
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Authenticated User Checkout Payment Submission & Cancellation
// ---------------------------------------------------------------------------
router.post('/user/payments', requireFirebaseUser, async (req: UserAuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const uid = req.firebaseUser!.uid;
    const { planId, billingCycle, paymentMethod, transactionId, receiptDataUrl } = req.body || {};

    if (!planId || !['monthly', 'yearly'].includes(billingCycle)) {
      return res.status(400).json({ success: false, error: 'Valid plan and billing cycle are required.' });
    }
    if (!paymentMethod || !String(paymentMethod).trim()) {
      return res.status(400).json({ success: false, error: 'Payment method is required.' });
    }
    if (!transactionId || !String(transactionId).trim()) {
      return res.status(400).json({ success: false, error: 'Transaction ID / reference number is required.' });
    }

    if (receiptDataUrl && typeof receiptDataUrl === 'string') {
      if (!receiptDataUrl.startsWith('data:image/')) {
        return res.status(400).json({ success: false, error: 'Receipt must be an image file.' });
      }
      if (receiptDataUrl.length > 750_000) {
        return res.status(400).json({
          success: false,
          error: 'Receipt image is too large. Please upload an image under 500 KB.',
        });
      }
    }

    const payment = await runDbTransaction((db) => {
      const user = db.users.find((u) => u.uid === uid);
      if (!user) throw Object.assign(new Error('User profile not synced.'), { statusCode: 404 });
      if (user.status === 'suspended') throw Object.assign(new Error('Account suspended.'), { statusCode: 403 });

      const plan = db.pricingPlans.find((p) => p.id === planId && p.isActive);
      if (!plan) {
        throw Object.assign(new Error('Selected pricing plan is unavailable.'), { statusCode: 400 });
      }

      const amountUsd = billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
      const creditsToGrant = billingCycle === 'yearly' ? plan.credits * 12 : plan.credits;
      const nowIso = new Date().toISOString();
      const paymentId = `pay_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

      const hasReceipt = Boolean(receiptDataUrl && typeof receiptDataUrl === 'string');
      if (hasReceipt) {
        const mimeMatch = String(receiptDataUrl).match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
        db.paymentReceipts.unshift({
          paymentId,
          userId: uid,
          dataUrl: receiptDataUrl,
          mimeType: mimeMatch?.[1] || 'image/jpeg',
          createdAt: nowIso,
        });
      }

      const rec = {
        id: paymentId,
        userId: uid,
        userEmail: user.email,
        userName: user.displayName,
        planId: plan.id,
        planName: plan.name,
        billingCycle: billingCycle as 'monthly' | 'yearly',
        amountUsd,
        creditsToGrant,
        paymentMethod: String(paymentMethod).trim(),
        transactionId: String(transactionId).trim(),
        hasReceipt,
        status: 'pending' as const,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      db.paymentRequests.unshift(rec);

      db.userNotifications.unshift({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: uid,
        title: 'Payment Submitted for Review',
        message: `Your payment request (${rec.transactionId}) for ${plan.name} ($${amountUsd}) is pending admin verification.`,
        type: 'info',
        read: false,
        createdAt: nowIso,
      });

      return rec;
    });

    res.status(201).json({ success: true, payment });
  } catch (err) {
    next(err);
  }
});

router.post('/user/payments/:id/cancel', requireFirebaseUser, async (req: UserAuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const uid = req.firebaseUser!.uid;
    const payment = await runDbTransaction((db) => {
      const target = db.paymentRequests.find((p) => p.id === req.params.id && p.userId === uid);
      if (!target) throw Object.assign(new Error('Payment request not found.'), { statusCode: 404 });
      if (target.status !== 'pending') {
        throw Object.assign(new Error(`Cannot cancel a payment that is already ${target.status}.`), { statusCode: 400 });
      }
      target.status = 'cancelled';
      target.updatedAt = new Date().toISOString();
      return target;
    });

    res.json({ success: true, payment });
  } catch (err) {
    next(err);
  }
});

router.post('/user/notifications/read-all', requireFirebaseUser, async (req: UserAuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const uid = req.firebaseUser!.uid;
    await runDbTransaction((db) => {
      db.userNotifications.forEach((n) => {
        if (n.userId === uid) n.read = true;
      });
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
