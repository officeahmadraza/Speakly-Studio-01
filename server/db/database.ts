import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, Firestore as AdminFirestore } from 'firebase-admin/firestore';
import { config, isApiKeyConfigured } from '../config.js';
import {
  SpeaklyDatabase,
  PricingPlanRecord,
  PlatformSettingsRecord,
  AdminAccount,
  ROLE_PERMISSIONS_MAP,
  ApiIntegrationRecord,
} from '../types/admin.js';
import { hashPassword, encryptSecret, maskApiKey } from '../services/cryptoVault.js';

export const INITIAL_SUPER_ADMIN_EMAIL = 'officeahmadraza@gmail.com';
const DATA_DIR = path.resolve(process.cwd(), '.speakly-data');
const DB_FILE_PATH = path.join(DATA_DIR, 'speakly_db.json');

let adminFirestoreDb: AdminFirestore | null = null;
let firestoreBridgeStatus: 'uninitialized' | 'connected' | 'client_sdk_only' = 'uninitialized';

async function initOptionalAdminFirestore(): Promise<void> {
  if (firestoreBridgeStatus !== 'uninitialized') return;
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(cfgPath)) {
      firestoreBridgeStatus = 'client_sdk_only';
      return;
    }
    const fbCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (!saJson) {
      firestoreBridgeStatus = 'client_sdk_only';
      return;
    }

    const app =
      getApps().length > 0
        ? getApps()[0]
        : initializeApp({
            credential: cert(JSON.parse(saJson)),
            projectId: fbCfg.projectId,
          });

    const db = getAdminFirestore(app, fbCfg.firestoreDatabaseId);
    await db.collection('pricing_plans').limit(1).get();
    adminFirestoreDb = db;
    firestoreBridgeStatus = 'connected';
    console.log('[DB] Server-side Firebase Admin Firestore connected.');
  } catch (err: any) {
    firestoreBridgeStatus = 'client_sdk_only';
    console.warn('[DB] Server Firestore bridge running in atomic local-store + client-Firestore sync mode:', err.message);
  }
}

export function getAdminFirestoreBridge(): AdminFirestore | null {
  return adminFirestoreDb;
}

export function getDatabaseMode(): string {
  return firestoreBridgeStatus === 'connected'
    ? 'Firebase Admin Firestore + Atomic Server Store'
    : 'Firebase Client Firestore + Atomic Transactional Server Store';
}

function createDefaultPlans(now: string): PricingPlanRecord[] {
  return [
    {
      id: 'plan_starter',
      name: 'Starter',
      audience: 'For individual creators testing AI voiceovers',
      monthlyPrice: 0,
      yearlyPrice: 0,
      credits: 2500,
      durationDays: 30,
      features: [
        '2,500 monthly synthesis credits',
        'Access to standard voice actors',
        'MP3 & WAV verified downloads',
        'Dynamic 1:1 credit character allowance',
      ],
      isActive: true,
      isFeatured: false,
      displayOrder: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'plan_pro',
      name: 'Pro',
      audience: 'For podcasters, educators & content studios',
      monthlyPrice: 24,
      yearlyPrice: 240,
      credits: 15000,
      durationDays: 30,
      features: [
        '15,000 monthly synthesis credits',
        'Priority speech generation queue',
        'Word-aligned transcript metadata',
        'Unlimited cloud projects & favorites',
      ],
      isActive: true,
      isFeatured: true,
      displayOrder: 2,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'plan_studio',
      name: 'Studio',
      audience: 'For high-volume production & teams',
      monthlyPrice: 79,
      yearlyPrice: 790,
      credits: 60000,
      durationDays: 30,
      features: [
        '60,000 monthly synthesis credits',
        'Full 22,000+ voice catalog search',
        'Commercial broadcast exports',
        'Priority support & custom voices',
      ],
      isActive: true,
      isFeatured: false,
      displayOrder: 3,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function createDefaultPlatformSettings(now: string): PlatformSettingsRecord {
  return {
    siteName: 'Speakly Studio',
    logoUrl: '',
    faviconUrl: '',
    supportEmail: 'support@speaklystudio.ai',
    contactInfo: 'Speakly Studio Operations · Monday–Friday, 9:00–18:00 UTC',
    defaultCredits: 0,
    defaultPlanId: 'plan_starter',
    allowRegistration: true,
    signupBonusEnabled: true,
    signupBonusCredits: 5000,
    creditCostPer1kChars: 1000,
    transcriptSurchargePercent: 25,
    paymentInstructions:
      'Send the exact plan amount via Bank Transfer, Wise, or USDT (TRC20), then upload a clear payment receipt screenshot along with your Transaction ID below. An administrator will review and activate your credits shortly.',
    acceptedPaymentMethods: ['Bank Transfer', 'Wise', 'PayPal', 'USDT (TRC20)', 'Card / Invoice'],
    notifyAdminOnNewPayment: true,
    notifyUserOnPaymentDecision: true,
    maxTextChars: config.maxTextChars || 50000,
    supportedLanguages: [
      'English',
      'Spanish',
      'French',
      'German',
      'Italian',
      'Portuguese',
      'Japanese',
      'Arabic',
      'Hindi',
      'Korean',
    ],
    maintenanceMode: false,
    maintenanceMessage:
      'Speakly Studio is currently undergoing scheduled maintenance. Please check back shortly.',
    updatedAt: now,
  };
}

function createDefaultIntegrations(now: string): ApiIntegrationRecord[] {
  const configured = isApiKeyConfigured();
  return [
    {
      id: 'int_openspeaker_primary',
      providerName: 'OpenSpeaker / ElevenLabs Gateway',
      providerType: 'openspeaker',
      endpointUrl: config.apiBaseUrl,
      modelName: 'eleven_multilingual_v2',
      encryptedApiKey: configured ? encryptSecret(config.apiKey) : '',
      maskedKey: configured ? maskApiKey(config.apiKey) : 'Not Configured',
      isEnabled: configured,
      isPrimary: true,
      rateLimitPerMin: 60,
      usageCount: 0,
      totalEstimatedCostUsd: 0,
      lastTestedAt: null,
      lastStatus: configured ? 'connected' : 'untested',
      lastStatusMessage: configured ? 'Active via configured server key' : 'No API key configured',
      recentErrors: [],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function createEmptyDb(): SpeaklyDatabase {
  const now = new Date().toISOString();
  return {
    adminAccounts: [],
    adminSessions: [],
    users: [],
    welcomeBonusClaims: [],
    creditTransactions: [],
    paymentRequests: [],
    paymentReceipts: [],
    pricingPlans: createDefaultPlans(now),
    apiIntegrations: createDefaultIntegrations(now),
    projects: [],
    speechHistory: [],
    voiceOverrides: [],
    platformSettings: createDefaultPlatformSettings(now),
    auditLogs: [],
    userNotifications: [],
  };
}

let inMemoryDb: SpeaklyDatabase | null = null;
let writeMutexPromise: Promise<void> = Promise.resolve();

function ensureStorageDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadDbFromDisk(): SpeaklyDatabase {
  if (inMemoryDb) return inMemoryDb;
  ensureStorageDir();

  const defaults = createEmptyDb();

  if (fs.existsSync(DB_FILE_PATH)) {
    try {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<SpeaklyDatabase>;
      inMemoryDb = {
        ...defaults,
        ...parsed,
        adminAccounts: Array.isArray(parsed.adminAccounts)
          ? parsed.adminAccounts.map((acc) => ({
              ...acc,
              mustChangePassword: false,
            }))
          : [],
        adminSessions: Array.isArray(parsed.adminSessions) ? parsed.adminSessions : [],
        users: Array.isArray(parsed.users) ? parsed.users : [],
        welcomeBonusClaims: Array.isArray(parsed.welcomeBonusClaims) ? parsed.welcomeBonusClaims : [],
        creditTransactions: Array.isArray(parsed.creditTransactions) ? parsed.creditTransactions : [],
        paymentRequests: Array.isArray(parsed.paymentRequests) ? parsed.paymentRequests : [],
        paymentReceipts: Array.isArray(parsed.paymentReceipts) ? parsed.paymentReceipts : [],
        pricingPlans:
          Array.isArray(parsed.pricingPlans) && parsed.pricingPlans.length > 0
            ? parsed.pricingPlans
            : defaults.pricingPlans,
        apiIntegrations:
          Array.isArray(parsed.apiIntegrations) && parsed.apiIntegrations.length > 0
            ? parsed.apiIntegrations
            : defaults.apiIntegrations,
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        speechHistory: Array.isArray(parsed.speechHistory) ? parsed.speechHistory : [],
        voiceOverrides: Array.isArray(parsed.voiceOverrides) ? parsed.voiceOverrides : [],
        platformSettings: {
          ...defaults.platformSettings,
          ...(parsed.platformSettings || {}),
          ...(parsed.platformSettings?.signupBonusCredits === undefined ? { defaultCredits: 0 } : {}),
        },
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
        userNotifications: Array.isArray(parsed.userNotifications) ? parsed.userNotifications : [],
      };
    } catch (err) {
      console.error('[DB] Failed parsing speakly_db.json, initializing clean store:', err);
      inMemoryDb = defaults;
    }
  } else {
    inMemoryDb = defaults;
  }

  syncBootstrapSuperAdmin(inMemoryDb);
  persistDbToDisk(inMemoryDb);
  return inMemoryDb;
}

function persistDbToDisk(db: SpeaklyDatabase): void {
  ensureStorageDir();
  const tmpPath = `${DB_FILE_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_FILE_PATH);
}

/**
 * Ensures officeahmadraza@gmail.com is bootstrapped if ADMIN_PASSWORD is provided in env.
 * Never hardcodes any fallback password.
 */
export function syncBootstrapSuperAdmin(db: SpeaklyDatabase): void {
  const envAdminPassword = (process.env.ADMIN_PASSWORD || '').trim();
  const existing = db.adminAccounts.find(
    (a) => a.email.toLowerCase() === INITIAL_SUPER_ADMIN_EMAIL.toLowerCase()
  );

  if (!existing && envAdminPassword) {
    const now = new Date().toISOString();
    const { hash, salt } = hashPassword(envAdminPassword);
    const superAdmin: AdminAccount = {
      id: 'admin_super_root',
      email: INITIAL_SUPER_ADMIN_EMAIL,
      name: 'Super Administrator',
      role: 'Super Admin',
      permissions: [...ROLE_PERMISSIONS_MAP['Super Admin']],
      passwordHash: hash,
      passwordSalt: salt,
      isActive: true,
      mustChangePassword: false,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };
    db.adminAccounts.unshift(superAdmin);
  }
}

export function isSuperAdminPasswordConfigured(): boolean {
  const db = loadDbFromDisk();
  const existing = db.adminAccounts.find(
    (a) => a.email.toLowerCase() === INITIAL_SUPER_ADMIN_EMAIL.toLowerCase()
  );
  return Boolean(existing || (process.env.ADMIN_PASSWORD || '').trim());
}

export async function initDatabase(): Promise<void> {
  await initOptionalAdminFirestore();
  loadDbFromDisk();
}

export function readDatabase(): SpeaklyDatabase {
  const db = loadDbFromDisk();
  // Re-check ADMIN_PASSWORD dynamically in case env was updated
  const beforeLen = db.adminAccounts.length;
  syncBootstrapSuperAdmin(db);
  if (db.adminAccounts.length !== beforeLen) {
    persistDbToDisk(db);
  }
  return db;
}

/**
 * Serialized atomic transaction wrapper.
 * Clones state for rollback safety if mutator throws.
 */
export function runDbTransaction<T>(mutator: (db: SpeaklyDatabase) => Promise<T> | T): Promise<T> {
  const next = writeMutexPromise.then(async () => {
    const db = readDatabase();
    const snapshot = JSON.parse(JSON.stringify(db)) as SpeaklyDatabase;
    try {
      const result = await mutator(db);
      persistDbToDisk(db);
      inMemoryDb = db;
      return result;
    } catch (err) {
      inMemoryDb = snapshot;
      throw err;
    }
  });

  writeMutexPromise = next.then(
    () => undefined,
    () => undefined
  );

  return next;
}
