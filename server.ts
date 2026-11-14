import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { config } from './server/config.js';
import { createRateLimiter } from './server/rateLimiter.js';
import { checkHealth } from './server/services/healthService.js';
import {
  fetchVoiceCatalog,
  invalidateVoiceCache,
  getCachedVoiceById,
  searchUpstreamVoices,
  mergeVoicesWithOverrides,
  queryVoiceCatalog,
  getVoicesByIds,
  prewarmVoiceCatalog,
  toSlimVoice,
} from './server/services/voiceService.js';
import { createTTSTask, validateTTSInput } from './server/services/ttsService.js';
import { fetchTaskStatus } from './server/services/taskService.js';
import { streamTaskAudio, streamPreviewAudio } from './server/services/downloadService.js';
import {
  calculateCreditBreakdown,
  DEFAULT_CREDIT_COST_PER_1K_CHARS,
  DEFAULT_TRANSCRIPT_SURCHARGE_PERCENT,
  formatTranscriptAsTxt,
  WordAlignedTranscript,
} from './shared/creditPricing.js';
import {
  OpenSpeakerError,
  resolveActiveApiConfig,
  recordIntegrationTelemetry,
  sanitizeUpstreamErrorMessage,
} from './server/services/openspeakerClient.js';
import {
  initDatabase,
  hydrateDatabaseFromFirestore,
  runDbTransaction,
} from './server/db/database.js';
import { extractFirebaseContext } from './server/services/firebaseTokenVerifier.js';
import { signTaskMetaToken, verifyTaskMetaToken } from './server/services/cryptoVault.js';
import { resolveAdminSession } from './server/services/adminAuthService.js';
import adminRoutes from './server/routes/adminRoutes.js';
import userRoutes, { optionalFirebaseUser } from './server/routes/userRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await initDatabase();

const app = express();

// Trust reverse proxy for correct req.ip handling in Cloud Run / container
app.set('trust proxy', 1);

// Standard JSON parser (1.5MB allows compressed receipt images on /api/user/payments)
app.use(express.json({ limit: '1.5mb' }));

// Track pending task metadata server-side for authoritative speech history & credit deduction
interface ServerTaskMeta {
  taskId: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  voiceId: string;
  voiceName: string;
  projectId?: string;
  text: string;
  charCount: number;
  wordCount: number;
  speed: number;
  withTranscript: boolean;
  fileName?: string;
  creditCostPer1kChars: number;
  transcriptSurchargePercent: number;
  estimatedAudioCredits: number;
  estimatedTranscriptCredits: number;
  estimatedTotalCredits: number;
  integrationId: string | null;
  finalized: boolean;
  createdAt: number;
}
const pendingTaskMetaMap = new Map<string, ServerTaskMeta>();

// Normalize Netlify serverless function path prefixes
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.url.startsWith('/.netlify/functions/api')) {
    req.url = req.url.replace('/.netlify/functions/api', '') || '/';
  }
  if (
    !req.url.startsWith('/api') &&
    (req.url.startsWith('/voices') ||
      req.url.startsWith('/tts') ||
      req.url.startsWith('/tasks') ||
      req.url.startsWith('/download') ||
      req.url.startsWith('/audio-proxy') ||
      req.url.startsWith('/config') ||
      req.url.startsWith('/health') ||
      req.url.startsWith('/user') ||
      req.url.startsWith('/public') ||
      req.url.startsWith('/admin'))
  ) {
    req.url = `/api${req.url}`;
  }
  next();
});

// Rate limiters
const ttsRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 15,
  message: 'TTS generation limit reached. Please wait a minute before starting another task.',
});

const downloadRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Audio download rate limit reached. Please wait a minute before downloading again.',
});

// Mount Super Admin & User Sync/Bootstrap Routes
app.use('/api/admin', adminRoutes);
app.use('/api', userRoutes);

// 1. Health check
app.get('/api/health', async (_req: Request, res: Response) => {
  await hydrateDatabaseFromFirestore({ allowLocalFallback: true }).catch(() => undefined);
  const health = await checkHealth();
  const statusCode = health.status === 'ok' ? 200 : health.configured ? 502 : 200;
  res.status(statusCode).json(health);
});

// 2. Safe Public Client Config (Never exposes API Key)
app.get('/api/config', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = await hydrateDatabaseFromFirestore({ allowLocalFallback: true });
    const activeCfg = resolveActiveApiConfig();
    const dbSettings = db.platformSettings;
    res.json({
      isConfigured: activeCfg.configured,
      apiBaseUrl: activeCfg.apiBaseUrl,
      maxTextChars: dbSettings?.maxTextChars || config.maxTextChars,
      creditCostPer1kChars: DEFAULT_CREDIT_COST_PER_1K_CHARS,
      transcriptSurchargePercent:
        dbSettings?.transcriptSurchargePercent ?? DEFAULT_TRANSCRIPT_SURCHARGE_PERCENT,
    });
  } catch (err) {
    next(err);
  }
});

// 3. Voices Catalog — supports fast paginated/filtered queries & slim legacy mode
app.get('/api/voices', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const hasPaginationOrFilter =
      req.query.page !== undefined ||
      req.query.limit !== undefined ||
      req.query.q !== undefined ||
      req.query.category !== undefined ||
      req.query.language !== undefined ||
      req.query.accent !== undefined ||
      req.query.gender !== undefined ||
      req.query.sort !== undefined ||
      req.query.ids !== undefined;

    const db = await hydrateDatabaseFromFirestore({ allowLocalFallback: true });

    if (hasPaginationOrFilter && req.query.all !== 'true') {
      const pageNum = parseInt(String(req.query.page || '1'), 10);
      const limitNum = parseInt(String(req.query.limit || '24'), 10);
      const sortRaw = String(req.query.sort || 'default');
      const sort =
        sortRaw === 'name-asc' || sortRaw === 'name-desc' || sortRaw === 'category-asc'
          ? sortRaw
          : 'default';
      const idsRaw = typeof req.query.ids === 'string' ? req.query.ids : '';
      const ids = idsRaw ? idsRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

      const pageData = await queryVoiceCatalog(
        {
          page: Number.isFinite(pageNum) ? pageNum : 1,
          limit: Number.isFinite(limitNum) ? limitNum : 24,
          q: typeof req.query.q === 'string' ? req.query.q : undefined,
          category: typeof req.query.category === 'string' ? req.query.category : undefined,
          language: typeof req.query.language === 'string' ? req.query.language : undefined,
          accent: typeof req.query.accent === 'string' ? req.query.accent : undefined,
          gender: typeof req.query.gender === 'string' ? req.query.gender : undefined,
          sort,
          ids,
        },
        db.voiceOverrides,
        forceRefresh
      );

      if (!pageData.hydrating && !forceRefresh) {
        res.setHeader('Cache-Control', 'private, max-age=30');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }

      return res.json({
        success: true,
        items: pageData.items,
        voices: pageData.items,
        totalMatches: pageData.totalMatches,
        totalCatalog: pageData.totalCatalog,
        page: pageData.page,
        limit: pageData.limit,
        totalPages: pageData.totalPages,
        hasMore: pageData.hasMore,
        hydrating: pageData.hydrating,
        version: pageData.version,
        facets: pageData.facets,
        inspection: pageData.inspection,
        cachedAt: pageData.cachedAt,
        expiresAt: pageData.expiresAt,
        degraded: pageData.degraded,
        warning: pageData.warning,
      });
    }

    const catalog = await fetchVoiceCatalog(forceRefresh, true);
    const mergedVoices = mergeVoicesWithOverrides(catalog.voices, db.voiceOverrides, false).map(toSlimVoice);

    res.json({
      success: true,
      voices: mergedVoices,
      version: catalog.version,
      hydrating: catalog.hydrating,
      inspection: {
        ...catalog.inspection,
        totalVoices: mergedVoices.length,
      },
      cachedAt: catalog.cachedAt,
      expiresAt: catalog.expiresAt,
      degraded: catalog.degraded,
      warning: catalog.warning,
    });
  } catch (err) {
    next(err);
  }
});

// Batch resolve specific voice IDs (for Favorites / Recent / Selected hydration without loading catalog)
app.post('/api/voices/batch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    const db = await hydrateDatabaseFromFirestore({ allowLocalFallback: true });
    const result = await getVoicesByIds(ids, db.voiceOverrides);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// Manual catalog refresh route
app.post('/api/voices/refresh', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    invalidateVoiceCache();
    const [catalog, db] = await Promise.all([
      fetchVoiceCatalog(true, true),
      hydrateDatabaseFromFirestore({ allowLocalFallback: true }),
    ]);
    const mergedVoices = mergeVoicesWithOverrides(catalog.voices, db.voiceOverrides, false).map(toSlimVoice);
    res.json({
      success: true,
      voices: mergedVoices.slice(0, 24),
      totalCatalog: mergedVoices.length,
      version: catalog.version,
      inspection: {
        ...catalog.inspection,
        totalVoices: mergedVoices.length,
      },
      degraded: catalog.degraded,
      warning: catalog.warning,
      message: catalog.degraded
        ? `Catalog partially refreshed (${mergedVoices.length} voices): ${catalog.warning || 'upstream busy'}`
        : `Catalog refreshed (${mergedVoices.length.toLocaleString()} voices).`,
    });
  } catch (err) {
    next(err);
  }
});

// Search voices upstream across all 22,000+ ElevenLabs voices
app.get('/api/voices/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = (req.query.q as string) || '';
    if (!query.trim()) {
      return res.json({ success: true, voices: [] });
    }
    const [voices, db] = await Promise.all([
      searchUpstreamVoices(query.trim()),
      hydrateDatabaseFromFirestore({ allowLocalFallback: true }),
    ]);
    const disabledSet = new Set(db.voiceOverrides.filter((o) => !o.enabled).map((o) => o.voiceId));
    const filtered = voices.filter((v) => !disabledSet.has(v.id)).map(toSlimVoice);
    res.json({
      success: true,
      voices: filtered,
    });
  } catch (err) {
    next(err);
  }
});

// Voice Preview Stream Proxy
app.get('/api/voices/:voiceId/preview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const voiceId = req.params.voiceId;
    const directUrl = req.query.url as string | undefined;

    let targetUrl = directUrl && directUrl.trim().startsWith('http') ? directUrl.trim() : undefined;
    if (!targetUrl) {
      const db = await hydrateDatabaseFromFirestore({ allowLocalFallback: true });
      const customOv = db.voiceOverrides.find((o) => o.voiceId === voiceId && o.customPreviewUrl);
      if (customOv?.customPreviewUrl) {
        targetUrl = customOv.customPreviewUrl;
      } else {
        let voice = getCachedVoiceById(voiceId);
        if (!voice) {
          const catalog = await fetchVoiceCatalog();
          voice = catalog.voices.find(
            (v) => v.id === voiceId || v.id === `elevenlabs_${voiceId}` || `elevenlabs_${v.id}` === voiceId
          );
        }
        targetUrl = voice?.previewUrl || undefined;
      }
    }

    if (!targetUrl) {
      return res.status(404).json({
        success: false,
        error: 'Preview audio not available for this voice.',
      });
    }

    await streamPreviewAudio(targetUrl, res);
  } catch (err) {
    next(err);
  }
});

// General Audio Stream Proxy
app.get('/api/audio-proxy', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetUrl = req.query.url as string | undefined;
    if (!targetUrl || !targetUrl.trim().startsWith('http')) {
      return res.status(400).json({ success: false, error: 'Valid audio URL is required.' });
    }
    await streamPreviewAudio(targetUrl.trim(), res);
  } catch (err) {
    next(err);
  }
});

// 4. Create TTS Task (Checks Maintenance Mode, User Suspension & Credits)
app.post('/api/tts', ttsRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fbCtx = await extractFirebaseContext(req, { allowLocalFallback: true });
    const db = await hydrateDatabaseFromFirestore(fbCtx);
    if (db.platformSettings.maintenanceMode) {
      const adminSess = await resolveAdminSession(req);
      if (!adminSess) {
        return res.status(503).json({
          success: false,
          error: db.platformSettings.maintenanceMessage || 'Platform is currently in maintenance mode.',
        });
      }
    }

    const fbUser = await optionalFirebaseUser(req);
    if (!fbUser || !fbUser.isGoogleAuth || !fbUser.emailVerified) {
      return res.status(401).json({
        success: false,
        code: 'GOOGLE_AUTH_REQUIRED',
        error:
          'Google Sign-In is required to generate speech. Sign in with Google to receive 5,000 free welcome credits.',
      });
    }

    const userRecord = db.users.find(
      (u) => u.uid === fbUser.uid || (fbUser.googleSub && u.googleSub === fbUser.googleSub)
    );
    if (!userRecord) {
      return res.status(401).json({
        success: false,
        code: 'USER_SYNC_REQUIRED',
        error: 'Please complete account sync by signing in with Google before generating speech.',
      });
    }

    if (userRecord.status === 'suspended') {
      return res.status(403).json({
        success: false,
        error: 'Your account is currently suspended. Contact support for assistance.',
      });
    }

    if ((userRecord.remainingCredits || 0) <= 0) {
      return res.status(402).json({
        success: false,
        code: 'INSUFFICIENT_CREDITS',
        error: 'Insufficient credits remaining (0 credits available). Please upgrade or top up your plan.',
      });
    }

    const { text, voiceId, speed, withTranscript, fileName, voiceName, projectId } = req.body || {};
    const wantTranscript = Boolean(withTranscript);
    const trimmedText = typeof text === 'string' ? text.trim() : '';
    const maxAllowedChars = Math.max(0, Math.floor(userRecord.remainingCredits || 0));

    if (trimmedText.length > maxAllowedChars) {
      return res.status(400).json({
        success: false,
        code: 'CHARACTER_LIMIT_EXCEEDED',
        error: `Script length (${trimmedText.length.toLocaleString()} chars) exceeds your available credit-based character limit of ${maxAllowedChars.toLocaleString()} characters (1 credit = 1 character).`,
      });
    }

    const creditCostPer1kChars =
      db.platformSettings.creditCostPer1kChars || DEFAULT_CREDIT_COST_PER_1K_CHARS;
    const transcriptSurchargePercent =
      db.platformSettings.transcriptSurchargePercent ?? DEFAULT_TRANSCRIPT_SURCHARGE_PERCENT;

    const estimate = calculateCreditBreakdown({
      charCount: trimmedText.length,
      withTranscript: wantTranscript,
      availableCredits: userRecord.remainingCredits,
      creditCostPer1kChars,
      transcriptSurchargePercent,
    });

    if (trimmedText.length > 0 && !estimate.hasEnoughCredits) {
      return res.status(402).json({
        success: false,
        code: 'INSUFFICIENT_CREDITS',
        error: `Insufficient credits: this generation requires ~${estimate.totalCredits.toLocaleString()} credits, but you only have ${estimate.availableCredits.toLocaleString()} credits available (${estimate.shortfallCredits.toLocaleString()} more credits needed).`,
      });
    }

    // Respect voice tier restrictions if user is authenticated
    const ov = db.voiceOverrides.find((o) => o.voiceId === voiceId);
    if (ov && !ov.enabled) {
      return res.status(403).json({ success: false, error: 'This voice has been disabled by an administrator.' });
    }

    // Validate parameters synchronously against dynamic character limit before upstream call
    validateTTSInput(
      {
        text,
        voiceId,
        speed: speed !== undefined ? Number(speed) : undefined,
        withTranscript: wantTranscript,
        fileName,
      },
      { maxAllowedChars }
    );

    const activeCfg = resolveActiveApiConfig();
    const result = await createTTSTask(
      {
        text,
        voiceId,
        speed: speed !== undefined ? Number(speed) : undefined,
        withTranscript: wantTranscript,
        fileName,
      },
      { maxAllowedChars }
    );

    const cachedVoice = getCachedVoiceById(voiceId);
    const metaEntry: ServerTaskMeta = {
      taskId: result.taskId,
      userId: userRecord.uid,
      userEmail: userRecord.email,
      userName: userRecord.displayName || 'Studio User',
      voiceId: result.voiceId,
      voiceName: voiceName || ov?.customName || cachedVoice?.name || result.voiceId,
      projectId: projectId ? String(projectId) : undefined,
      text: trimmedText,
      charCount: result.characterCount,
      wordCount: result.wordCount,
      speed: speed !== undefined ? Number(speed) : 1.0,
      withTranscript: wantTranscript,
      fileName: result.fileName,
      creditCostPer1kChars,
      transcriptSurchargePercent,
      estimatedAudioCredits: estimate.audioCredits,
      estimatedTranscriptCredits: estimate.transcriptCredits,
      estimatedTotalCredits: estimate.totalCredits,
      integrationId: activeCfg.integrationId,
      finalized: false,
      createdAt: Date.now(),
    };
    pendingTaskMetaMap.set(result.taskId, metaEntry);

    // Compact HMAC-signed token so Vercel serverless lambdas can recover metadata even across cold starts
    const taskMetaToken = signTaskMetaToken({
      ...metaEntry,
      text: trimmedText.length > 900 ? `${trimmedText.slice(0, 900)}...` : trimmedText,
    });

    // Prune stale map entries older than 2 hours
    if (pendingTaskMetaMap.size > 500) {
      const cutoff = Date.now() - 2 * 3600 * 1000;
      for (const [k, v] of pendingTaskMetaMap.entries()) {
        if (v.createdAt < cutoff) pendingTaskMetaMap.delete(k);
      }
    }

    res.status(201).json({ ...result, taskMetaToken });
  } catch (err) {
    next(err);
  }
});

// 5. Poll Task Status (Atomically Records Speech History & Deducts Credits on Completion)
app.get('/api/tasks/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.taskId;
    const fbCtx = await extractFirebaseContext(req, { allowLocalFallback: true });
    const initialDb = await hydrateDatabaseFromFirestore(fbCtx);
    const existingHistory = initialDb.speechHistory.find((h) => h.taskId === taskId);

    let meta = pendingTaskMetaMap.get(taskId);
    if (!meta && !existingHistory) {
      const rawToken =
        (typeof req.headers['x-task-meta'] === 'string' ? req.headers['x-task-meta'] : '') ||
        (typeof req.query.taskMetaToken === 'string' ? req.query.taskMetaToken : '');
      if (rawToken) {
        const verified = verifyTaskMetaToken<ServerTaskMeta>(rawToken);
        if (verified && verified.taskId === taskId && (!fbCtx.uid || verified.userId === fbCtx.uid)) {
          meta = { ...verified, finalized: false };
          pendingTaskMetaMap.set(taskId, meta);
        }
      }
    }

    const includeTranscript = meta
      ? meta.withTranscript
      : Boolean(existingHistory?.withTranscript);

    const task = await fetchTaskStatus(taskId, { includeTranscript });
    let updatedRemainingCredits: number | undefined;

    if (
      meta &&
      !meta.finalized &&
      !existingHistory &&
      (task.status === 'done' || task.status === 'completed' || task.status === 'failed' || task.status === 'error')
    ) {
      meta.finalized = true;
      const upstreamDone = task.status === 'done' || task.status === 'completed';
      const hasValidTranscript = Boolean(
        includeTranscript &&
          task.transcriptData &&
          Array.isArray(task.transcriptData.words) &&
          task.transcriptData.words.length > 0
      );

      // Fail & charge 0 (refunding if any prior debit existed) when transcript was requested but unavailable
      const transcriptFailed = Boolean(meta.withTranscript && upstreamDone && !hasValidTranscript);
      const isSuccess = upstreamDone && !transcriptFailed;

      let enrichedTranscript: WordAlignedTranscript | undefined = undefined;
      if (isSuccess && meta.withTranscript && task.transcriptData) {
        enrichedTranscript = {
          ...task.transcriptData,
          voiceId: meta.voiceId,
          voiceName: meta.voiceName,
          text: meta.text,
          speed: meta.speed,
          charCount: meta.charCount,
          wordCount: meta.wordCount,
        };
        task.transcriptData = enrichedTranscript;
      } else {
        task.transcriptData = undefined;
      }

      const failureReason = transcriptFailed
        ? 'Word-aligned transcript generation was enabled, but word timing data was unavailable from the synthesis provider. Generation marked as failed and all credits were refunded.'
        : task.errorMessage || 'Upstream synthesis failed';

      if (transcriptFailed) {
        task.status = 'failed';
        task.audioUrl = null;
        task.errorMessage = failureReason;
        task.creditCost = 0;
      }

      let recordedAudioCredits = 0;
      let recordedTranscriptCredits = 0;
      let recordedTotalCost = 0;

      const writeCtx = {
        ...fbCtx,
        requireFirestore: Boolean(fbCtx.firebaseIdToken),
        allowLocalFallback: !fbCtx.firebaseIdToken,
      };

      await runDbTransaction((db) => {
        if (db.speechHistory.some((h) => h.taskId === taskId)) return;

        const settings = db.platformSettings;
        const surchargePct =
          meta!.transcriptSurchargePercent ??
          settings.transcriptSurchargePercent ??
          DEFAULT_TRANSCRIPT_SURCHARGE_PERCENT;

        // Strict 1:1 billing rule: always charge 1 credit per trimmed char (+25% rounded up when transcript succeeded)
        const billingBreakdown = calculateCreditBreakdown({
          charCount: meta!.charCount,
          withTranscript: Boolean(isSuccess && meta!.withTranscript && hasValidTranscript),
          availableCredits: Number.MAX_SAFE_INTEGER,
          transcriptSurchargePercent: surchargePct,
        });

        const baseAudioCost = isSuccess ? billingBreakdown.audioCredits : 0;
        const transcriptSurchargeCost = isSuccess ? billingBreakdown.transcriptCredits : 0;
        const computedTotalCost = isSuccess ? billingBreakdown.totalCredits : 0;
        const estSec = Math.max(1, Math.round(((meta!.wordCount / 145) * 60) / (meta!.speed || 1)));
        const nowIso = new Date().toISOString();

        recordedAudioCredits = isSuccess ? baseAudioCost : 0;
        recordedTranscriptCredits = transcriptSurchargeCost;
        recordedTotalCost = computedTotalCost;

        db.speechHistory.unshift({
          id: `gen_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          userId: meta!.userId,
          userEmail: meta!.userEmail,
          userName: meta!.userName,
          taskId,
          voiceId: meta!.voiceId,
          voiceName: meta!.voiceName,
          language: undefined,
          projectId: meta!.projectId,
          text: meta!.text,
          charCount: meta!.charCount,
          wordCount: meta!.wordCount,
          speed: meta!.speed,
          withTranscript: meta!.withTranscript,
          hasTranscript: Boolean(isSuccess && meta!.withTranscript && enrichedTranscript),
          transcriptData: isSuccess && meta!.withTranscript ? enrichedTranscript : undefined,
          fileName: meta!.fileName,
          audioUrl: isSuccess ? task.audioUrl || null : null,
          creditCost: computedTotalCost,
          estimatedDurationSec: estSec,
          status: isSuccess ? 'completed' : 'failed',
          errorMessage: isSuccess ? null : failureReason,
          createdAt: nowIso,
        });

        if (db.speechHistory.length > 3000) {
          db.speechHistory = db.speechHistory.slice(0, 3000);
        }

        if (meta!.userId !== 'guest') {
          const user = db.users.find((u) => u.uid === meta!.userId);
          if (user) {
            if (isSuccess && computedTotalCost > 0) {
              const prevBal = user.remainingCredits || 0;
              const deduct = Math.min(prevBal, computedTotalCost);
              user.remainingCredits = Math.max(0, prevBal - deduct);
              user.totalConsumedCredits = (user.totalConsumedCredits || 0) + deduct;
              user.updatedAt = nowIso;
              updatedRemainingCredits = user.remainingCredits;

              db.creditTransactions.unshift({
                id: `ctx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
                userId: user.uid,
                userEmail: user.email,
                userName: user.displayName,
                previousBalance: prevBal,
                amount: -deduct,
                newBalance: user.remainingCredits,
                type: 'consumption',
                reason: meta!.withTranscript
                  ? `Speech + Transcript (${meta!.voiceName})`
                  : `Speech generation (${meta!.voiceName})`,
                note: `Task ${taskId} · ${meta!.charCount} chars${
                  transcriptSurchargeCost > 0 ? ` · +${transcriptSurchargeCost} transcript credits` : ''
                }`,
                createdAt: nowIso,
              });
            } else {
              // Ensure zero charge & explicitly refund if any prior consumption transaction existed for this task
              const priorDebit = db.creditTransactions.find(
                (t) =>
                  t.userId === user.uid &&
                  t.type === 'consumption' &&
                  typeof t.note === 'string' &&
                  t.note.includes(taskId)
              );
              if (priorDebit && priorDebit.amount < 0) {
                const refundAmt = Math.abs(priorDebit.amount);
                const prevBal = user.remainingCredits || 0;
                user.remainingCredits = prevBal + refundAmt;
                user.totalConsumedCredits = Math.max(0, (user.totalConsumedCredits || 0) - refundAmt);
                user.updatedAt = nowIso;

                db.creditTransactions.unshift({
                  id: `ctx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
                  userId: user.uid,
                  userEmail: user.email,
                  userName: user.displayName,
                  previousBalance: prevBal,
                  amount: refundAmt,
                  newBalance: user.remainingCredits,
                  type: 'refund',
                  reason: transcriptFailed
                    ? `Full refund — transcript unavailable (${meta!.voiceName})`
                    : `Full refund — generation failed (${meta!.voiceName})`,
                  note: `Task ${taskId}`,
                  createdAt: nowIso,
                });
              }
              updatedRemainingCredits = user.remainingCredits;
            }
          }
        }
      }, writeCtx);

      if (isSuccess) {
        task.creditCost = recordedTotalCost;
        (task as any).audioCredits = recordedAudioCredits;
        (task as any).transcriptCredits = recordedTranscriptCredits;
      }

      if (isSuccess && meta.integrationId) {
        const approxUsd = Math.round((meta.charCount / 1000) * 0.03 * 10000) / 10000;
        await recordIntegrationTelemetry({
          integrationId: meta.integrationId,
          endpoint: '/v3/text-to-speech',
          success: true,
          statusCode: 200,
          estimatedCostUsd: approxUsd,
        }).catch((e) => console.warn('[Telemetry] warning:', e?.message || e));
      }
    } else if (existingHistory) {
      // Subsequent polls after finalization: enforce persisted completion/failure/transcript state
      if (existingHistory.status === 'failed') {
        task.status = 'failed';
        task.audioUrl = null;
        task.creditCost = 0;
        task.transcriptData = undefined;
        task.errorMessage = existingHistory.errorMessage || task.errorMessage;
      } else {
        task.creditCost = existingHistory.creditCost;
        task.transcriptData =
          existingHistory.withTranscript && existingHistory.hasTranscript
            ? existingHistory.transcriptData || task.transcriptData
            : undefined;
      }
    }

    res.json({
      success: true,
      task,
      updatedRemainingCredits,
    });
  } catch (err) {
    next(err);
  }
});

// 6. Download Completed Audio & Word-Aligned Transcript (.txt)
app.get('/api/tasks/:taskId/transcript', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.taskId;
    const fbCtx = await extractFirebaseContext(req, { allowLocalFallback: true });
    const db = await hydrateDatabaseFromFirestore(fbCtx);
    const record = db.speechHistory.find((h) => h.taskId === taskId);

    if (!record || record.status !== 'completed' || !record.withTranscript || !record.hasTranscript) {
      return res.status(404).json({
        success: false,
        error: 'Word-aligned transcript is not available for this task.',
      });
    }

    let transcriptData = record.transcriptData;
    if (!transcriptData || !Array.isArray(transcriptData.words) || transcriptData.words.length === 0) {
      const liveTask = await fetchTaskStatus(taskId, { includeTranscript: true });
      if (
        liveTask?.transcriptData &&
        Array.isArray(liveTask.transcriptData.words) &&
        liveTask.transcriptData.words.length > 0
      ) {
        transcriptData = {
          ...liveTask.transcriptData,
          voiceId: record.voiceId,
          voiceName: record.voiceName,
          text: record.text,
          speed: record.speed,
          charCount: record.charCount,
          wordCount: record.wordCount,
        };
      }
    }

    if (!transcriptData || !Array.isArray(transcriptData.words) || transcriptData.words.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Word-aligned transcript is not available for this task.',
      });
    }

    const rawDisplayName = (record.fileName || record.voiceName || `speech_${taskId}`).trim();
    const safeFileSlug = rawDisplayName
      .replace(/[^a-zA-Z0-9_\-\s]/g, '_')
      .trim()
      .replace(/\s+/g, '_');

    const txtContent = formatTranscriptAsTxt({
      transcript: transcriptData,
      fileName: rawDisplayName,
      totalCharacters: typeof record.text === 'string' ? record.text.trim().length : record.charCount,
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileSlug || 'speech'}_transcript.txt"`);
    res.send(txtContent);
  } catch (err) {
    next(err);
  }
});

app.get('/api/download/:taskId', downloadRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.taskId;
    const customFileName = req.query.filename as string | undefined;
    const directUrl = (req.query.url as string | undefined) || undefined;
    await streamTaskAudio(taskId, res, customFileName, directUrl);
  } catch (err) {
    next(err);
  }
});

app.get('/api/download', downloadRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = (req.query.taskId as string) || 'direct';
    const customFileName = req.query.filename as string | undefined;
    const directUrl = (req.query.url as string | undefined) || undefined;
    await streamTaskAudio(taskId, res, customFileName, directUrl);
  } catch (err) {
    next(err);
  }
});

// Centralized error handler (strictly sanitizes any secret keys)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err.statusCode || (err instanceof OpenSpeakerError ? err.statusCode : 500);
  const activeCfg = resolveActiveApiConfig();
  const message = sanitizeUpstreamErrorMessage(err.message || 'An unexpected error occurred.', activeCfg.apiKey);

  if (err instanceof OpenSpeakerError && (statusCode === 502 || statusCode === 503 || statusCode === 504)) {
    console.warn(`[UpstreamUnavailable] (${statusCode}) ${message}`);
  } else if (statusCode >= 500) {
    console.error('[ServerError]', message);
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    statusCode,
    retryAfter: err.retryAfter,
    code: err.code,
  });
});

// Vite or Static Asset Integration (serves / and /admin as SPA)
const isProduction = process.env.NODE_ENV === 'production';
const isServerless = Boolean(
  process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME
);

if (!isProduction && !isServerless) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else if (!isServerless) {
  const distPath = path.resolve(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
}

if (!isServerless) {
  const PORT = config.port;
  app.listen(PORT, '0.0.0.0', () => {
    const activeCfg = resolveActiveApiConfig();
    console.log(`[Speakly Studio] Server running on http://localhost:${PORT}`);
    console.log(`  App:   http://localhost:${PORT}/`);
    console.log(`  Admin: http://localhost:${PORT}/admin`);
    console.log(`[Speakly Studio] API Base: ${activeCfg.apiBaseUrl} (Configured: ${activeCfg.configured ? 'YES' : 'NO'})`);
    if (activeCfg.configured) {
      prewarmVoiceCatalog();
    }
  });
}

export { app };
