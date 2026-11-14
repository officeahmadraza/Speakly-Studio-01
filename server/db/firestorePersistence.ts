import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import {
  AdminAccount,
  ApiIntegrationRecord,
  AuditLogRecord,
  CreditTransactionRecord,
  DbProjectRecord,
  DbSpeechHistoryRecord,
  DbUser,
  PaymentReceiptRecord,
  PaymentRequestRecord,
  PlatformSettingsRecord,
  PricingPlanRecord,
  SpeaklyDatabase,
  UserNotificationRecord,
  VoiceOverrideRecord,
  WelcomeBonusClaimRecord,
} from '../types/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface FirestoreConfigInfo {
  projectId: string;
  firestoreDatabaseId: string;
}

export interface FirestoreContext {
  firebaseIdToken?: string;
  isAdminToken?: boolean;
  uid?: string;
  requireFirestore?: boolean;
  allowLocalFallback?: boolean;
}

export type FirestoreTransportMode = 'admin-sdk' | 'id-token' | 'public-rest' | 'local-only';

let cachedFbConfig: FirestoreConfigInfo | null = null;

export function getFirebaseProjectConfig(): FirestoreConfigInfo | null {
  if (cachedFbConfig) return cachedFbConfig;
  const candidates = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(__dirname, '../../firebase-applet-config.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (parsed?.projectId) {
          cachedFbConfig = {
            projectId: String(parsed.projectId),
            firestoreDatabaseId: String(parsed.firestoreDatabaseId || '(default)'),
          };
          return cachedFbConfig;
        }
      }
    } catch {
      // try next candidate
    }
  }
  const envProj = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  if (envProj) {
    cachedFbConfig = {
      projectId: envProj,
      firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || '(default)',
    };
    return cachedFbConfig;
  }
  return null;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
export function sanitizeFirestoreId(raw: string, prefix = 'id'): string {
  const cleaned = String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  if (cleaned && VALID_ID_REGEX.test(cleaned)) return cleaned;
  return `${prefix}_${Date.now()}`;
}

export function normalizeTimestamp(val: any, fallback = ''): string {
  if (!val) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'number' && Number.isFinite(val)) return new Date(val).toISOString();
  if (typeof val?.toDate === 'function') {
    try {
      return val.toDate().toISOString();
    } catch {
      return fallback;
    }
  }
  if (typeof val?._seconds === 'number') {
    return new Date(val._seconds * 1000 + Math.floor((val._nanoseconds || 0) / 1e6)).toISOString();
  }
  if (typeof val?.seconds === 'number') {
    return new Date(val.seconds * 1000 + Math.floor((val.nanoseconds || 0) / 1e6)).toISOString();
  }
  return fallback;
}

function stableJson(v: unknown): string {
  return JSON.stringify(v ?? null);
}

// ---------------------------------------------------------------------------
// Firestore REST API v1 Value Serialization / Deserialization
// ---------------------------------------------------------------------------
function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { integerValue: '0' };
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((item) => toFirestoreValue(item)) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(fv: any): any {
  if (!fv || typeof fv !== 'object') return undefined;
  if ('nullValue' in fv) return null;
  if ('booleanValue' in fv) return Boolean(fv.booleanValue);
  if ('integerValue' in fv) return Number(fv.integerValue);
  if ('doubleValue' in fv) return Number(fv.doubleValue);
  if ('timestampValue' in fv) {
    return normalizeTimestamp(fv.timestampValue);
  }
  if ('stringValue' in fv) return String(fv.stringValue);
  if ('bytesValue' in fv) return String(fv.bytesValue);
  if ('referenceValue' in fv) return String(fv.referenceValue);
  if ('arrayValue' in fv) {
    const values = Array.isArray(fv.arrayValue?.values) ? fv.arrayValue.values : [];
    return values.map(fromFirestoreValue);
  }
  if ('mapValue' in fv) {
    const out: Record<string, any> = {};
    const fields = fv.mapValue?.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return undefined;
}

function restDocToObject(doc: any): { id: string; data: Record<string, any> } {
  const fullName = String(doc?.name || '');
  const id = fullName.split('/').pop() || '';
  const data: Record<string, any> = {};
  const fields = doc?.fields || {};
  for (const [k, v] of Object.entries(fields)) {
    data[k] = fromFirestoreValue(v);
  }
  return { id, data };
}

function adminDocToObject(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v && (typeof (v as any).toDate === 'function' || typeof (v as any)._seconds === 'number')) {
      out[k] = normalizeTimestamp(v);
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item && typeof item === 'object' && typeof (item as any).toDate === 'function'
          ? normalizeTimestamp(item)
          : item
      );
    } else if (v && typeof v === 'object') {
      out[k] = adminDocToObject(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function stripUndefined(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Strict Entity <-> Firestore Document Mappers (Compliant with firestore.rules)
// ---------------------------------------------------------------------------
function mapUserToPublicDoc(u: DbUser): Record<string, any> {
  const doc: Record<string, any> = {
    uid: u.uid,
    displayName: String(u.displayName || 'Speakly Creator').slice(0, 120) || 'Speakly Creator',
    role: 'user',
    status: u.status === 'suspended' ? 'suspended' : 'active',
    planId: sanitizeFirestoreId(u.planId || 'plan_starter', 'plan'),
    planName: String(u.planName || 'Starter').slice(0, 64) || 'Starter',
    billingCycle: ['monthly', 'yearly', 'lifetime'].includes(u.billingCycle)
      ? u.billingCycle
      : 'monthly',
    remainingCredits: Math.max(0, Number(u.remainingCredits) || 0),
    totalPurchasedCredits: Math.max(0, Number(u.totalPurchasedCredits) || 0),
    totalConsumedCredits: Math.max(0, Number(u.totalConsumedCredits) || 0),
    authProvider: u.authProvider === 'google' ? 'google' : 'other',
    welcomeBonusClaimed: Boolean(u.welcomeBonusClaimed),
    welcomeBonusAmount: Math.max(0, Number(u.welcomeBonusAmount) || 0),
    createdAt: u.createdAt || new Date().toISOString(),
    updatedAt: u.updatedAt || new Date().toISOString(),
    lastLoginAt: u.lastLoginAt || u.updatedAt || new Date().toISOString(),
  };
  if (u.googleSub) doc.googleSub = String(u.googleSub).slice(0, 128);
  if (u.welcomeBonusAwardedAt) doc.welcomeBonusAwardedAt = String(u.welcomeBonusAwardedAt).slice(0, 64);
  if (u.avatarUrl) doc.avatarUrl = String(u.avatarUrl).slice(0, 512);
  if (u.subscriptionExpiresAt) doc.subscriptionExpiresAt = String(u.subscriptionExpiresAt).slice(0, 64);
  if (typeof u.notes === 'string' && u.notes.length > 0) doc.notes = u.notes.slice(0, 2000);
  return doc;
}

function mapUserToPrivateDoc(u: DbUser): Record<string, any> {
  const email =
    u.email && u.email.trim().length >= 3
      ? u.email.trim().slice(0, 254)
      : `${u.uid}@speakly.local`.slice(0, 254);
  const speed = Number(u.defaultSpeed);
  const clampedSpeed = Number.isFinite(speed) ? Math.min(1.5, Math.max(0.5, speed)) : 1.0;
  return {
    uid: u.uid,
    email,
    notifyOnComplete: u.notifyOnComplete !== undefined ? Boolean(u.notifyOnComplete) : true,
    notifyAccountAlerts: u.notifyAccountAlerts !== undefined ? Boolean(u.notifyAccountAlerts) : true,
    defaultLanguage: String(u.defaultLanguage || 'English').slice(0, 64),
    defaultSpeed: clampedSpeed,
    updatedAt: u.updatedAt || new Date().toISOString(),
  };
}

function mapFirestoreToUser(pub: Record<string, any>, priv?: Record<string, any> | null): DbUser {
  const createdAt = normalizeTimestamp(pub.createdAt, new Date().toISOString());
  const updatedAt = normalizeTimestamp(pub.updatedAt, createdAt);
  return {
    uid: String(pub.uid),
    email: String(priv?.email || pub.email || ''),
    displayName: String(pub.displayName || 'Speakly Creator'),
    avatarUrl: pub.avatarUrl ? String(pub.avatarUrl) : '',
    status: pub.status === 'suspended' ? 'suspended' : 'active',
    planId: String(pub.planId || 'plan_starter'),
    planName: String(pub.planName || 'Starter'),
    billingCycle: ['monthly', 'yearly', 'lifetime'].includes(pub.billingCycle)
      ? pub.billingCycle
      : 'monthly',
    subscriptionExpiresAt: pub.subscriptionExpiresAt ? normalizeTimestamp(pub.subscriptionExpiresAt) : null,
    remainingCredits: Number(pub.remainingCredits) || 0,
    totalPurchasedCredits: Number(pub.totalPurchasedCredits) || 0,
    totalConsumedCredits: Number(pub.totalConsumedCredits) || 0,
    defaultLanguage: String(priv?.defaultLanguage || 'English'),
    defaultSpeed: Number(priv?.defaultSpeed) || 1.0,
    notifyOnComplete: priv?.notifyOnComplete !== undefined ? Boolean(priv.notifyOnComplete) : true,
    notifyAccountAlerts:
      priv?.notifyAccountAlerts !== undefined ? Boolean(priv.notifyAccountAlerts) : true,
    notes: typeof pub.notes === 'string' ? pub.notes : undefined,
    authProvider: pub.authProvider === 'google' ? 'google' : 'other',
    googleSub: pub.googleSub ? String(pub.googleSub) : undefined,
    welcomeBonusClaimed: Boolean(pub.welcomeBonusClaimed),
    welcomeBonusAmount: Number(pub.welcomeBonusAmount) || 0,
    welcomeBonusAwardedAt: pub.welcomeBonusAwardedAt
      ? normalizeTimestamp(pub.welcomeBonusAwardedAt)
      : null,
    createdAt,
    updatedAt,
    lastLoginAt: normalizeTimestamp(pub.lastLoginAt, updatedAt),
  };
}

function mapPlanToDoc(p: PricingPlanRecord): Record<string, any> {
  return stripUndefined({
    id: sanitizeFirestoreId(p.id, 'plan'),
    name: String(p.name || 'Plan').slice(0, 80),
    audience: String(p.audience || '').slice(0, 200),
    monthlyPrice: Math.max(0, Number(p.monthlyPrice) || 0),
    yearlyPrice: Math.max(0, Number(p.yearlyPrice) || 0),
    credits: Math.max(0, Math.round(Number(p.credits) || 0)),
    durationDays: Math.max(1, Math.round(Number(p.durationDays) || 30)),
    features: Array.isArray(p.features) ? p.features.map(String) : [],
    isActive: Boolean(p.isActive),
    isFeatured: Boolean(p.isFeatured),
    displayOrder: Number(p.displayOrder) || 1,
    createdAt: p.createdAt || new Date().toISOString(),
    updatedAt: p.updatedAt || new Date().toISOString(),
  });
}

function mapDocToPlan(d: Record<string, any>): PricingPlanRecord {
  const updatedAt = normalizeTimestamp(d.updatedAt, new Date().toISOString());
  return {
    id: String(d.id),
    name: String(d.name || 'Plan'),
    audience: String(d.audience || ''),
    monthlyPrice: Number(d.monthlyPrice) || 0,
    yearlyPrice: Number(d.yearlyPrice) || 0,
    credits: Number(d.credits) || 0,
    durationDays: Number(d.durationDays) || 30,
    features: Array.isArray(d.features) ? d.features.map(String) : [],
    isActive: d.isActive !== undefined ? Boolean(d.isActive) : true,
    isFeatured: Boolean(d.isFeatured),
    displayOrder: Number(d.displayOrder) || 1,
    createdAt: normalizeTimestamp(d.createdAt, updatedAt),
    updatedAt,
  };
}

function mapPaymentToDoc(p: PaymentRequestRecord): Record<string, any> {
  const doc: Record<string, any> = {
    id: sanitizeFirestoreId(p.id, 'pay'),
    userId: sanitizeFirestoreId(p.userId, 'usr'),
    planId: sanitizeFirestoreId(p.planId, 'plan'),
    planName: String(p.planName || 'Plan').slice(0, 80) || 'Plan',
    billingCycle: p.billingCycle === 'yearly' ? 'yearly' : 'monthly',
    amountUsd: Math.max(0, Number(p.amountUsd) || 0),
    creditsToGrant: Math.max(1, Math.round(Number(p.creditsToGrant) || 1)),
    paymentMethod: String(p.paymentMethod || 'Manual').slice(0, 64) || 'Manual',
    transactionId: String(p.transactionId || 'TX').slice(0, 128).padEnd(2, '0'),
    status: ['pending', 'approved', 'rejected', 'cancelled'].includes(p.status)
      ? p.status
      : 'pending',
    createdAt: p.createdAt || new Date().toISOString(),
    updatedAt: p.updatedAt || new Date().toISOString(),
  };
  if (p.rejectionReason) doc.rejectionReason = String(p.rejectionReason).slice(0, 500);
  if (p.adminNote) doc.adminNote = String(p.adminNote).slice(0, 500);
  if (p.reviewedByAdminId) doc.reviewedByAdminId = String(p.reviewedByAdminId).slice(0, 128);
  if (p.reviewedByEmail) doc.reviewedByEmail = String(p.reviewedByEmail).slice(0, 254);
  if (p.reviewedAt) doc.reviewedAt = String(p.reviewedAt).slice(0, 64);
  if (p.creditTransactionId) doc.creditTransactionId = String(p.creditTransactionId).slice(0, 128);
  return doc;
}

function mapDocToPayment(
  d: Record<string, any>,
  usersById: Map<string, DbUser>,
  receiptIds: Set<string>
): PaymentRequestRecord {
  const userId = String(d.userId || '');
  const u = usersById.get(userId);
  const createdAt = normalizeTimestamp(d.createdAt, new Date().toISOString());
  return {
    id: String(d.id),
    userId,
    userEmail: String(u?.email || d.userEmail || ''),
    userName: String(u?.displayName || d.userName || 'User'),
    planId: String(d.planId || ''),
    planName: String(d.planName || ''),
    billingCycle: d.billingCycle === 'yearly' ? 'yearly' : 'monthly',
    amountUsd: Number(d.amountUsd) || 0,
    creditsToGrant: Number(d.creditsToGrant) || 0,
    paymentMethod: String(d.paymentMethod || ''),
    transactionId: String(d.transactionId || ''),
    hasReceipt: receiptIds.has(String(d.id)) || Boolean(d.hasReceipt),
    status: (d.status || 'pending') as PaymentRequestRecord['status'],
    adminNote: d.adminNote ? String(d.adminNote) : undefined,
    rejectionReason: d.rejectionReason ? String(d.rejectionReason) : undefined,
    reviewedByAdminId: d.reviewedByAdminId ? String(d.reviewedByAdminId) : undefined,
    reviewedByEmail: d.reviewedByEmail ? String(d.reviewedByEmail) : undefined,
    reviewedAt: d.reviewedAt ? normalizeTimestamp(d.reviewedAt) : undefined,
    creditTransactionId: d.creditTransactionId ? String(d.creditTransactionId) : undefined,
    createdAt,
    updatedAt: normalizeTimestamp(d.updatedAt, createdAt),
  };
}

function mapReceiptToDoc(r: PaymentReceiptRecord): Record<string, any> {
  return {
    paymentId: sanitizeFirestoreId(r.paymentId, 'pay'),
    userId: sanitizeFirestoreId(r.userId, 'usr'),
    dataUrl: String(r.dataUrl || '').slice(0, 524288),
    createdAt: r.createdAt || new Date().toISOString(),
  };
}

function mapDocToReceipt(d: Record<string, any>): PaymentReceiptRecord {
  const dataUrl = String(d.dataUrl || '');
  const mimeMatch = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
  return {
    paymentId: String(d.paymentId),
    userId: String(d.userId || ''),
    dataUrl,
    mimeType: String(d.mimeType || mimeMatch?.[1] || 'image/jpeg'),
    createdAt: normalizeTimestamp(d.createdAt, new Date().toISOString()),
  };
}

function mapCreditTxToDoc(t: CreditTransactionRecord): Record<string, any> {
  return stripUndefined({
    id: sanitizeFirestoreId(t.id, 'ctx'),
    userId: sanitizeFirestoreId(t.userId, 'usr'),
    googleSub: t.googleSub ? String(t.googleSub).slice(0, 128) : undefined,
    previousBalance: Number(t.previousBalance) || 0,
    amount: Number(t.amount) || 0,
    newBalance: Number(t.newBalance) || 0,
    type: t.type,
    reason: String(t.reason || 'Credit update').slice(0, 240) || 'Credit update',
    note: t.note ? String(t.note).slice(0, 500) : undefined,
    adminId: t.adminId ? String(t.adminId).slice(0, 128) : undefined,
    adminEmail: t.adminEmail ? String(t.adminEmail).slice(0, 254) : undefined,
    relatedPaymentId: t.relatedPaymentId ? String(t.relatedPaymentId).slice(0, 128) : undefined,
    createdAt: t.createdAt || new Date().toISOString(),
  });
}

function mapDocToCreditTx(
  d: Record<string, any>,
  usersById: Map<string, DbUser>
): CreditTransactionRecord {
  const userId = String(d.userId || '');
  const u = usersById.get(userId);
  return {
    id: String(d.id),
    userId,
    userEmail: u?.email || (d.userEmail ? String(d.userEmail) : undefined),
    userName: u?.displayName || (d.userName ? String(d.userName) : undefined),
    googleSub: d.googleSub ? String(d.googleSub) : u?.googleSub,
    previousBalance: Number(d.previousBalance) || 0,
    amount: Number(d.amount) || 0,
    newBalance: Number(d.newBalance) || 0,
    type: (d.type || 'manual_add') as CreditTransactionRecord['type'],
    reason: String(d.reason || ''),
    note: d.note ? String(d.note) : undefined,
    adminId: d.adminId ? String(d.adminId) : undefined,
    adminEmail: d.adminEmail ? String(d.adminEmail) : undefined,
    relatedPaymentId: d.relatedPaymentId ? String(d.relatedPaymentId) : undefined,
    createdAt: normalizeTimestamp(d.createdAt, new Date().toISOString()),
  };
}

function mapProjectToDoc(p: DbProjectRecord): Record<string, any> {
  const doc: Record<string, any> = {
    id: sanitizeFirestoreId(p.id, 'proj'),
    userId: sanitizeFirestoreId(p.userId, 'usr'),
    name: String(p.name || 'Untitled Project').slice(0, 160) || 'Untitled Project',
    description: String(p.description || '').slice(0, 500),
    script: String(p.script || '').slice(0, 500000),
    status: p.status === 'archived' ? 'archived' : 'active',
    createdAt: p.createdAt || new Date().toISOString(),
    updatedAt: p.updatedAt || new Date().toISOString(),
  };
  if (p.voiceId) doc.voiceId = String(p.voiceId).slice(0, 128);
  if (p.voiceName) doc.voiceName = String(p.voiceName).slice(0, 160);
  if (p.speed !== undefined && Number.isFinite(Number(p.speed))) {
    doc.speed = Math.min(1.5, Math.max(0.5, Number(p.speed)));
  }
  if (p.withTranscript !== undefined) doc.withTranscript = Boolean(p.withTranscript);
  if (p.fileName) doc.fileName = String(p.fileName).slice(0, 128);
  return doc;
}

function mapDocToProject(
  d: Record<string, any>,
  usersById: Map<string, DbUser>
): DbProjectRecord {
  const userId = String(d.userId || '');
  const u = usersById.get(userId);
  const createdAt = normalizeTimestamp(d.createdAt, new Date().toISOString());
  return {
    id: String(d.id),
    userId,
    userEmail: u?.email || (d.userEmail ? String(d.userEmail) : undefined),
    userName: u?.displayName || (d.userName ? String(d.userName) : undefined),
    name: String(d.name || 'Untitled Project'),
    description: String(d.description || ''),
    script: String(d.script || ''),
    voiceId: d.voiceId ? String(d.voiceId) : undefined,
    voiceName: d.voiceName ? String(d.voiceName) : undefined,
    speed: d.speed !== undefined ? Number(d.speed) : undefined,
    withTranscript: d.withTranscript !== undefined ? Boolean(d.withTranscript) : false,
    fileName: d.fileName ? String(d.fileName) : undefined,
    status: d.status === 'archived' ? 'archived' : 'active',
    createdAt,
    updatedAt: normalizeTimestamp(d.updatedAt, createdAt),
  };
}

function mapSpeechToDoc(s: DbSpeechHistoryRecord): Record<string, any> {
  const doc: Record<string, any> = {
    id: sanitizeFirestoreId(s.id, 'gen'),
    userId: sanitizeFirestoreId(s.userId, 'usr'),
    taskId: String(s.taskId || s.id).slice(0, 128) || s.id,
    voiceId: String(s.voiceId || 'default').slice(0, 128) || 'default',
    voiceName: String(s.voiceName || 'Voice').slice(0, 160) || 'Voice',
    text: String(s.text || ' ').slice(0, 500000) || ' ',
    charCount: Math.max(0, Number(s.charCount) || 0),
    wordCount: Math.max(0, Number(s.wordCount) || 0),
    withTranscript: Boolean(s.withTranscript),
    hasTranscript: Boolean(s.hasTranscript),
    status: ['completed', 'simulated', 'failed'].includes(s.status) ? s.status : 'completed',
    createdAt: s.createdAt || new Date().toISOString(),
  };
  if (s.projectId) doc.projectId = String(s.projectId).slice(0, 128);
  if (s.speed !== undefined && Number.isFinite(Number(s.speed))) doc.speed = Number(s.speed);
  if (s.fileName) doc.fileName = String(s.fileName).slice(0, 160);
  if (s.audioUrl) doc.audioUrl = String(s.audioUrl);
  if (s.creditCost !== undefined && Number.isFinite(Number(s.creditCost))) {
    doc.creditCost = Math.max(0, Number(s.creditCost));
  }
  if (s.estimatedDurationSec !== undefined && Number.isFinite(Number(s.estimatedDurationSec))) {
    doc.estimatedDurationSec = Math.max(0, Number(s.estimatedDurationSec));
  }
  if (s.language) doc.language = String(s.language).slice(0, 64);
  if (s.errorMessage) doc.errorMessage = String(s.errorMessage).slice(0, 1000);
  return doc;
}

function mapDocToSpeech(
  d: Record<string, any>,
  usersById: Map<string, DbUser>,
  existingLocal?: DbSpeechHistoryRecord
): DbSpeechHistoryRecord {
  const userId = String(d.userId || '');
  const u = usersById.get(userId);
  return {
    id: String(d.id),
    userId,
    userEmail: u?.email || (d.userEmail ? String(d.userEmail) : undefined),
    userName: u?.displayName || (d.userName ? String(d.userName) : undefined),
    taskId: String(d.taskId || ''),
    voiceId: String(d.voiceId || ''),
    voiceName: String(d.voiceName || ''),
    language: d.language ? String(d.language) : undefined,
    projectId: d.projectId ? String(d.projectId) : undefined,
    text: String(d.text || ''),
    charCount: Number(d.charCount) || 0,
    wordCount: Number(d.wordCount) || 0,
    speed: Number(d.speed) || 1.0,
    withTranscript: Boolean(d.withTranscript),
    hasTranscript: d.hasTranscript !== undefined ? Boolean(d.hasTranscript) : Boolean(d.withTranscript),
    transcriptData: existingLocal?.transcriptData,
    fileName: d.fileName ? String(d.fileName) : undefined,
    audioUrl: d.audioUrl ? String(d.audioUrl) : null,
    creditCost: Number(d.creditCost) || 0,
    estimatedDurationSec: Number(d.estimatedDurationSec) || 0,
    status: (d.status || 'completed') as DbSpeechHistoryRecord['status'],
    errorMessage: d.errorMessage ? String(d.errorMessage) : null,
    createdAt: normalizeTimestamp(d.createdAt, new Date().toISOString()),
  };
}

function mapVoiceOverrideToDoc(v: VoiceOverrideRecord): Record<string, any> {
  return stripUndefined({
    voiceId: sanitizeFirestoreId(v.voiceId, 'voice'),
    enabled: Boolean(v.enabled),
    customName: v.customName ? String(v.customName).slice(0, 160) : undefined,
    customCategory: v.customCategory ? String(v.customCategory).slice(0, 80) : undefined,
    customLanguage: v.customLanguage ? String(v.customLanguage).slice(0, 80) : undefined,
    customAccent: v.customAccent ? String(v.customAccent).slice(0, 80) : undefined,
    customGender: v.customGender ? String(v.customGender).slice(0, 40) : undefined,
    customDescription: v.customDescription ? String(v.customDescription).slice(0, 500) : undefined,
    allowedPlans: Array.isArray(v.allowedPlans) ? v.allowedPlans.map(String) : [],
    isCustomAdded: Boolean(v.isCustomAdded),
    customPreviewUrl: v.customPreviewUrl ? String(v.customPreviewUrl).slice(0, 512) : undefined,
    updatedAt: v.updatedAt || new Date().toISOString(),
  });
}

function mapDocToVoiceOverride(d: Record<string, any>): VoiceOverrideRecord {
  return {
    voiceId: String(d.voiceId),
    enabled: d.enabled !== undefined ? Boolean(d.enabled) : true,
    customName: d.customName ? String(d.customName) : undefined,
    customCategory: d.customCategory ? String(d.customCategory) : undefined,
    customLanguage: d.customLanguage ? String(d.customLanguage) : undefined,
    customAccent: d.customAccent ? String(d.customAccent) : undefined,
    customGender: d.customGender ? String(d.customGender) : undefined,
    customDescription: d.customDescription ? String(d.customDescription) : undefined,
    allowedPlans: Array.isArray(d.allowedPlans) ? d.allowedPlans.map(String) : [],
    isCustomAdded: Boolean(d.isCustomAdded),
    customPreviewUrl: d.customPreviewUrl ? String(d.customPreviewUrl) : undefined,
    updatedAt: normalizeTimestamp(d.updatedAt, new Date().toISOString()),
  };
}

function mapPlatformSettingsToDoc(s: PlatformSettingsRecord): Record<string, any> {
  return stripUndefined({
    siteName: String(s.siteName || 'Speakly Studio').slice(0, 100),
    logoUrl: String(s.logoUrl || ''),
    faviconUrl: String(s.faviconUrl || ''),
    supportEmail: String(s.supportEmail || '').slice(0, 200),
    contactInfo: String(s.contactInfo || ''),
    defaultCredits: Math.max(0, Number(s.defaultCredits) || 0),
    defaultPlanId: String(s.defaultPlanId || 'plan_starter'),
    allowRegistration: Boolean(s.allowRegistration),
    signupBonusEnabled: s.signupBonusEnabled !== undefined ? Boolean(s.signupBonusEnabled) : true,
    signupBonusCredits: Math.max(0, Number(s.signupBonusCredits ?? 5000)),
    creditCostPer1kChars: Math.max(1, Number(s.creditCostPer1kChars) || 1000),
    transcriptSurchargePercent: Math.max(0, Number(s.transcriptSurchargePercent ?? 25)),
    paymentInstructions: String(s.paymentInstructions || ''),
    acceptedPaymentMethods: Array.isArray(s.acceptedPaymentMethods) ? s.acceptedPaymentMethods : [],
    notifyAdminOnNewPayment: Boolean(s.notifyAdminOnNewPayment),
    notifyUserOnPaymentDecision: Boolean(s.notifyUserOnPaymentDecision),
    maxTextChars: Math.max(500, Number(s.maxTextChars) || 50000),
    supportedLanguages: Array.isArray(s.supportedLanguages) ? s.supportedLanguages : ['English'],
    maintenanceMode: Boolean(s.maintenanceMode),
    maintenanceMessage: String(s.maintenanceMessage || ''),
    updatedAt: s.updatedAt || new Date().toISOString(),
  });
}

function mapDocToPlatformSettings(
  d: Record<string, any>,
  fallback: PlatformSettingsRecord
): PlatformSettingsRecord {
  return {
    ...fallback,
    ...d,
    siteName: String(d.siteName || fallback.siteName),
    acceptedPaymentMethods: Array.isArray(d.acceptedPaymentMethods)
      ? d.acceptedPaymentMethods.map(String)
      : fallback.acceptedPaymentMethods,
    supportedLanguages: Array.isArray(d.supportedLanguages)
      ? d.supportedLanguages.map(String)
      : fallback.supportedLanguages,
    updatedAt: normalizeTimestamp(d.updatedAt, fallback.updatedAt),
  };
}

function mapNotificationToDoc(n: UserNotificationRecord): Record<string, any> {
  return {
    id: sanitizeFirestoreId(n.id, 'notif'),
    userId: sanitizeFirestoreId(n.userId, 'usr'),
    title: String(n.title || 'Notification').slice(0, 120) || 'Notification',
    message: String(n.message || 'Update').slice(0, 500) || 'Update',
    type: ['info', 'success', 'warning', 'error'].includes(n.type) ? n.type : 'info',
    read: Boolean(n.read),
    createdAt: n.createdAt || new Date().toISOString(),
  };
}

function mapDocToNotification(d: Record<string, any>): UserNotificationRecord {
  return {
    id: String(d.id),
    userId: String(d.userId || ''),
    title: String(d.title || ''),
    message: String(d.message || ''),
    type: (d.type || 'info') as UserNotificationRecord['type'],
    read: Boolean(d.read),
    createdAt: normalizeTimestamp(d.createdAt, new Date().toISOString()),
  };
}

function mapAuditLogToDoc(a: AuditLogRecord): Record<string, any> {
  const email =
    a.adminEmail && a.adminEmail.length >= 3
      ? a.adminEmail.slice(0, 254)
      : 'admin@speakly.local';
  const doc: Record<string, any> = {
    id: sanitizeFirestoreId(a.id, 'aud'),
    adminId: String(a.adminId || 'admin').slice(0, 128) || 'admin',
    adminEmail: email,
    adminRole: String(a.adminRole || 'Super Admin').slice(0, 64) || 'Super Admin',
    action: String(a.action || 'ACTION').slice(0, 128) || 'ACTION',
    targetType: String(a.targetType || 'system').slice(0, 64) || 'system',
    targetId: String(a.targetId || 'global').slice(0, 128) || 'global',
    ipAddress: String(a.ipAddress || 'unknown').slice(0, 128),
    createdAt: a.createdAt || new Date().toISOString(),
  };
  if (a.previousValue !== undefined && a.previousValue !== null) doc.previousValue = a.previousValue;
  if (a.newValue !== undefined && a.newValue !== null) doc.newValue = a.newValue;
  return doc;
}

function mapDocToAuditLog(d: Record<string, any>): AuditLogRecord {
  return {
    id: String(d.id),
    adminId: String(d.adminId || ''),
    adminEmail: String(d.adminEmail || ''),
    adminRole: String(d.adminRole || ''),
    action: String(d.action || ''),
    targetType: String(d.targetType || ''),
    targetId: String(d.targetId || ''),
    previousValue: d.previousValue ?? null,
    newValue: d.newValue ?? null,
    ipAddress: String(d.ipAddress || 'unknown'),
    createdAt: normalizeTimestamp(d.createdAt, new Date().toISOString()),
  };
}

// ---------------------------------------------------------------------------
// Firestore REST v1 HTTP Helpers
// ---------------------------------------------------------------------------
function getRestBase(cfg: FirestoreConfigInfo): string {
  const dbId = encodeURIComponent(cfg.firestoreDatabaseId);
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/databases/${dbId}/documents`;
}

async function restFetchJson(
  url: string,
  options: { method?: string; body?: any; idToken?: string } = {}
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.idToken) {
    headers.Authorization = `Bearer ${options.idToken}`;
  }
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const errMsg =
      parsed?.error?.message ||
      (Array.isArray(parsed) && parsed[0]?.error?.message) ||
      `Firestore REST error (${res.status})`;
    const err = Object.assign(new Error(errMsg), { statusCode: res.status });
    throw err;
  }
  return parsed;
}

async function restListCollection(
  cfg: FirestoreConfigInfo,
  collectionId: string,
  idToken?: string,
  limit = 1000
): Promise<{ id: string; data: Record<string, any> }[]> {
  const results: { id: string; data: Record<string, any> }[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const sp = new URLSearchParams();
    sp.set('pageSize', String(Math.min(300, limit)));
    if (pageToken) sp.set('pageToken', pageToken);
    const url = `${getRestBase(cfg)}/${encodeURIComponent(collectionId)}?${sp.toString()}`;
    const res = await restFetchJson(url, { idToken });
    const docs = Array.isArray(res?.documents) ? res.documents : [];
    for (const d of docs) {
      results.push(restDocToObject(d));
    }
    pageToken = res?.nextPageToken;
  } while (pageToken && results.length < limit);

  return results;
}

async function restQueryByUserId(
  cfg: FirestoreConfigInfo,
  collectionId: string,
  uid: string,
  idToken: string,
  limit = 500
): Promise<{ id: string; data: Record<string, any> }[]> {
  const url = `${getRestBase(cfg)}:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'userId' },
          op: 'EQUAL',
          value: { stringValue: uid },
        },
      },
      limit,
    },
  };
  const rows = await restFetchJson(url, { method: 'POST', body, idToken });
  const results: { id: string; data: Record<string, any> }[] = [];
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (row?.document) {
        results.push(restDocToObject(row.document));
      }
    }
  }
  return results;
}

async function restGetDoc(
  cfg: FirestoreConfigInfo,
  docPath: string,
  idToken?: string
): Promise<{ id: string; data: Record<string, any> } | null> {
  const url = `${getRestBase(cfg)}/${docPath}`;
  try {
    const doc = await restFetchJson(url, { idToken });
    return restDocToObject(doc);
  } catch (err: any) {
    if (err.statusCode === 404) return null;
    throw err;
  }
}

async function restBatchGetDocs(
  cfg: FirestoreConfigInfo,
  docPaths: string[],
  idToken: string
): Promise<Map<string, Record<string, any>>> {
  const out = new Map<string, Record<string, any>>();
  if (docPaths.length === 0) return out;
  const baseDocName = `projects/${cfg.projectId}/databases/${cfg.firestoreDatabaseId}/documents`;

  for (let i = 0; i < docPaths.length; i += 100) {
    const chunk = docPaths.slice(i, i + 100);
    const url = `${getRestBase(cfg)}:batchGet`;
    const rows = await restFetchJson(url, {
      method: 'POST',
      body: { documents: chunk.map((p) => `${baseDocName}/${p}`) },
      idToken,
    });
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (row?.found) {
          const fullName = String(row.found.name || '');
          const marker = '/documents/';
          const idx = fullName.indexOf(marker);
          const relPath = idx >= 0 ? fullName.slice(idx + marker.length) : fullName;
          out.set(relPath, restDocToObject(row.found).data);
        }
      }
    }
  }
  return out;
}

interface RestWriteSpec {
  type: 'create' | 'update' | 'delete';
  docPath: string;
  fields?: Record<string, any>;
  updateMaskFields?: string[];
  serverTimestampFields?: ('createdAt' | 'updatedAt')[];
}

function buildRestWrite(cfg: FirestoreConfigInfo, spec: RestWriteSpec): any {
  const fullName = `projects/${cfg.projectId}/databases/${cfg.firestoreDatabaseId}/documents/${spec.docPath}`;
  if (spec.type === 'delete') {
    return { delete: fullName };
  }

  const rawFields = { ...(spec.fields || {}) };
  const serverFields = spec.serverTimestampFields || [];
  for (const sf of serverFields) {
    delete rawFields[sf];
  }

  const firestoreFields: Record<string, any> = {};
  for (const [k, v] of Object.entries(rawFields)) {
    if (v !== undefined) {
      firestoreFields[k] = toFirestoreValue(v);
    }
  }

  const writeObj: any = {
    update: {
      name: fullName,
      fields: firestoreFields,
    },
  };

  if (spec.type === 'create') {
    writeObj.currentDocument = { exists: false };
  } else if (spec.updateMaskFields && spec.updateMaskFields.length > 0) {
    writeObj.updateMask = {
      fieldPaths: spec.updateMaskFields.filter((f) => !serverFields.includes(f as any)),
    };
  }

  if (serverFields.length > 0) {
    writeObj.updateTransforms = serverFields.map((fieldPath) => ({
      fieldPath,
      setToServerValue: 'REQUEST_TIME',
    }));
  }

  return writeObj;
}

async function restCommitWrites(
  cfg: FirestoreConfigInfo,
  writes: RestWriteSpec[],
  idToken: string
): Promise<void> {
  if (writes.length === 0) return;
  const url = `${getRestBase(cfg)}:commit`;
  for (let i = 0; i < writes.length; i += 400) {
    const chunk = writes.slice(i, i + 400);
    await restFetchJson(url, {
      method: 'POST',
      body: { writes: chunk.map((w) => buildRestWrite(cfg, w)) },
      idToken,
    });
  }
}

// ---------------------------------------------------------------------------
// Seed Helpers (Ensure pricing_plans & platform_public/settings exist in Firestore)
// ---------------------------------------------------------------------------
async function seedDefaultsIfNeededAdminSdk(
  adminDb: AdminFirestore,
  baseDb: SpeaklyDatabase
): Promise<void> {
  const batch = adminDb.batch();
  let ops = 0;

  const plansSnap = await adminDb.collection('pricing_plans').limit(1).get();
  if (plansSnap.empty) {
    for (const plan of baseDb.pricingPlans) {
      const ref = adminDb.collection('pricing_plans').doc(sanitizeFirestoreId(plan.id, 'plan'));
      batch.set(ref, {
        ...mapPlanToDoc(plan),
        updatedAt: FieldValue.serverTimestamp(),
      });
      ops++;
    }
  }

  const settingsSnap = await adminDb.collection('platform_public').doc('settings').get();
  if (!settingsSnap.exists) {
    const ref = adminDb.collection('platform_public').doc('settings');
    batch.set(ref, {
      ...mapPlatformSettingsToDoc(baseDb.platformSettings),
      updatedAt: FieldValue.serverTimestamp(),
    });
    ops++;
  }

  if (ops > 0) {
    await batch.commit();
  }
}

// ---------------------------------------------------------------------------
// Hydrate SpeaklyDatabase from Firestore
// ---------------------------------------------------------------------------
export async function loadDatabaseStateFromFirestore(params: {
  adminDb: AdminFirestore | null;
  baseDb: SpeaklyDatabase;
  ctx?: FirestoreContext;
}): Promise<{ db: SpeaklyDatabase; mode: FirestoreTransportMode }> {
  const { adminDb, baseDb, ctx } = params;
  const cfg = getFirebaseProjectConfig();
  if (!cfg) {
    return { db: baseDb, mode: 'local-only' };
  }

  const next: SpeaklyDatabase = {
    ...baseDb,
    adminAccounts: [...baseDb.adminAccounts],
    adminSessions: [...baseDb.adminSessions],
    users: [...baseDb.users],
    welcomeBonusClaims: [...baseDb.welcomeBonusClaims],
    creditTransactions: [...baseDb.creditTransactions],
    paymentRequests: [...baseDb.paymentRequests],
    paymentReceipts: [...baseDb.paymentReceipts],
    pricingPlans: [...baseDb.pricingPlans],
    apiIntegrations: [...baseDb.apiIntegrations],
    projects: [...baseDb.projects],
    speechHistory: [...baseDb.speechHistory],
    voiceOverrides: [...baseDb.voiceOverrides],
    platformSettings: { ...baseDb.platformSettings },
    auditLogs: [...baseDb.auditLogs],
    userNotifications: [...baseDb.userNotifications],
  };

  // Preserve transcriptData map from local memory/disk cache since transcriptData is kept out of Firestore doc limits
  const localTranscriptByTaskId = new Map<string, DbSpeechHistoryRecord>();
  for (const s of baseDb.speechHistory) {
    localTranscriptByTaskId.set(s.id, s);
    if (s.taskId) localTranscriptByTaskId.set(s.taskId, s);
  }

  // MODE A: Full Server Admin SDK (all 16 collections)
  if (adminDb) {
    await seedDefaultsIfNeededAdminSdk(adminDb, baseDb);

    const [
      usersSnap,
      plansSnap,
      settingsDoc,
      voicesSnap,
      paymentsSnap,
      receiptsSnap,
      txSnap,
      projectsSnap,
      speechSnap,
      notifSnap,
      auditSnap,
      adminAccSnap,
      integrationsSnap,
      claimsSnap,
    ] = await Promise.all([
      adminDb.collection('users').get(),
      adminDb.collection('pricing_plans').get(),
      adminDb.collection('platform_public').doc('settings').get(),
      adminDb.collection('voice_overrides').get(),
      adminDb.collection('payment_requests').get(),
      adminDb.collection('payment_receipts').get(),
      adminDb.collection('credit_transactions').get(),
      adminDb.collection('projects').get(),
      adminDb.collection('speech_history').get(),
      adminDb.collection('notifications').get(),
      adminDb.collection('audit_logs').get(),
      adminDb.collection('admin_accounts').get(),
      adminDb.collection('api_integrations').get(),
      adminDb.collection('welcome_bonus_claims').get(),
    ]);

    // Fetch each user's private PII subcollection doc
    const privateByUid = new Map<string, Record<string, any>>();
    if (!usersSnap.empty) {
      const refs = usersSnap.docs.map((d) => d.ref.collection('private').doc('info'));
      const privDocs = await adminDb.getAll(...refs);
      privDocs.forEach((pSnap, idx) => {
        if (pSnap.exists) {
          privateByUid.set(usersSnap.docs[idx].id, adminDocToObject(pSnap.data() || {}));
        }
      });
    }

    const users = usersSnap.docs.map((d) =>
      mapFirestoreToUser(adminDocToObject({ uid: d.id, ...d.data() }), privateByUid.get(d.id))
    );
    const usersById = new Map(users.map((u) => [u.uid, u]));

    const receipts = receiptsSnap.docs.map((d) =>
      mapDocToReceipt(adminDocToObject({ paymentId: d.id, ...d.data() }))
    );
    const receiptIds = new Set(receipts.map((r) => r.paymentId));

    next.users = users;
    if (!plansSnap.empty) {
      next.pricingPlans = plansSnap.docs
        .map((d) => mapDocToPlan(adminDocToObject({ id: d.id, ...d.data() })))
        .sort((a, b) => a.displayOrder - b.displayOrder);
    }
    if (settingsDoc.exists) {
      next.platformSettings = mapDocToPlatformSettings(
        adminDocToObject(settingsDoc.data() || {}),
        baseDb.platformSettings
      );
    }
    next.voiceOverrides = voicesSnap.docs.map((d) =>
      mapDocToVoiceOverride(adminDocToObject({ voiceId: d.id, ...d.data() }))
    );
    next.paymentReceipts = receipts;
    next.paymentRequests = paymentsSnap.docs
      .map((d) => mapDocToPayment(adminDocToObject({ id: d.id, ...d.data() }), usersById, receiptIds))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    next.creditTransactions = txSnap.docs
      .map((d) => mapDocToCreditTx(adminDocToObject({ id: d.id, ...d.data() }), usersById))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    next.projects = projectsSnap.docs
      .map((d) => mapDocToProject(adminDocToObject({ id: d.id, ...d.data() }), usersById))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    next.speechHistory = speechSnap.docs
      .map((d) => {
        const raw = adminDocToObject({ id: d.id, ...d.data() });
        return mapDocToSpeech(
          raw,
          usersById,
          localTranscriptByTaskId.get(d.id) || localTranscriptByTaskId.get(String(raw.taskId || ''))
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    next.userNotifications = notifSnap.docs
      .map((d) => mapDocToNotification(adminDocToObject({ id: d.id, ...d.data() })))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    next.auditLogs = auditSnap.docs
      .map((d) => mapDocToAuditLog(adminDocToObject({ id: d.id, ...d.data() })))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (!adminAccSnap.empty) {
      next.adminAccounts = adminAccSnap.docs.map((d) =>
        adminDocToObject({ id: d.id, ...d.data(), mustChangePassword: false }) as AdminAccount
      );
    }
    if (!integrationsSnap.empty) {
      next.apiIntegrations = integrationsSnap.docs.map((d) =>
        adminDocToObject({ id: d.id, ...d.data() }) as ApiIntegrationRecord
      );
    }
    if (!claimsSnap.empty) {
      next.welcomeBonusClaims = claimsSnap.docs.map((d) =>
        adminDocToObject({ googleSub: d.id, ...d.data() }) as WelcomeBonusClaimRecord
      );
    }

    return { db: next, mode: 'admin-sdk' };
  }

  // MODE B: Firestore REST API v1
  const idToken = ctx?.firebaseIdToken;

  // Always load public collections (pricing_plans, platform_public/settings, voice_overrides)
  const [planDocs, settingsDoc, voiceDocs] = await Promise.all([
    restListCollection(cfg, 'pricing_plans', idToken, 100),
    restGetDoc(cfg, 'platform_public/settings', idToken),
    restListCollection(cfg, 'voice_overrides', idToken, 500),
  ]);

  if (planDocs.length > 0) {
    next.pricingPlans = planDocs
      .map((d) => mapDocToPlan({ id: d.id, ...d.data }))
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }
  if (settingsDoc) {
    next.platformSettings = mapDocToPlatformSettings(settingsDoc.data, baseDb.platformSettings);
  }
  next.voiceOverrides = voiceDocs.map((d) =>
    mapDocToVoiceOverride({ voiceId: d.id, ...d.data })
  );

  if (!idToken) {
    return { db: next, mode: 'public-rest' };
  }

  if (ctx?.isAdminToken) {
    // Admin Firebase ID token: hydrate all rule-accessible collections cleanly via REST
    // Seed default plans & settings to Firestore if empty so payment rules (`exists(pricing_plans)`) pass
    if (planDocs.length === 0 || !settingsDoc) {
      const seedWrites: RestWriteSpec[] = [];
      if (planDocs.length === 0) {
        for (const p of baseDb.pricingPlans) {
          seedWrites.push({
            type: 'create',
            docPath: `pricing_plans/${sanitizeFirestoreId(p.id, 'plan')}`,
            fields: mapPlanToDoc(p),
            serverTimestampFields: ['updatedAt'],
          });
        }
      }
      if (!settingsDoc) {
        seedWrites.push({
          type: 'create',
          docPath: 'platform_public/settings',
          fields: mapPlatformSettingsToDoc(baseDb.platformSettings),
          serverTimestampFields: ['updatedAt'],
        });
      }
      await restCommitWrites(cfg, seedWrites, idToken).catch((e) => {
        console.warn('[FirestoreREST] Seed default plans/settings warning:', e?.message || e);
      });
    }

    const [
      userDocs,
      paymentDocs,
      receiptDocs,
      txDocs,
      projectDocs,
      speechDocs,
      notifDocs,
      auditDocs,
    ] = await Promise.all([
      restListCollection(cfg, 'users', idToken, 1000),
      restListCollection(cfg, 'payment_requests', idToken, 1000),
      restListCollection(cfg, 'payment_receipts', idToken, 1000),
      restListCollection(cfg, 'credit_transactions', idToken, 2000),
      restListCollection(cfg, 'projects', idToken, 1000),
      restListCollection(cfg, 'speech_history', idToken, 2000),
      restListCollection(cfg, 'notifications', idToken, 1000),
      restListCollection(cfg, 'audit_logs', idToken, 2000),
    ]);

    const privatePaths = userDocs.map((d) => `users/${d.id}/private/info`);
    const privateDocsMap = await restBatchGetDocs(cfg, privatePaths, idToken);

    const users = userDocs.map((d) =>
      mapFirestoreToUser(
        { uid: d.id, ...d.data },
        privateDocsMap.get(`users/${d.id}/private/info`) || null
      )
    );
    const usersById = new Map(users.map((u) => [u.uid, u]));

    const receipts = receiptDocs.map((d) => mapDocToReceipt({ paymentId: d.id, ...d.data }));
    const receiptIds = new Set(receipts.map((r) => r.paymentId));

    next.users = users;
    next.paymentReceipts = receipts;
    next.paymentRequests = paymentDocs
      .map((d) => mapDocToPayment({ id: d.id, ...d.data }, usersById, receiptIds))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    next.creditTransactions = txDocs
      .map((d) => mapDocToCreditTx({ id: d.id, ...d.data }, usersById))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    next.projects = projectDocs
      .map((d) => mapDocToProject({ id: d.id, ...d.data }, usersById))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    next.speechHistory = speechDocs
      .map((d) =>
        mapDocToSpeech(
          { id: d.id, ...d.data },
          usersById,
          localTranscriptByTaskId.get(d.id) || localTranscriptByTaskId.get(String(d.data.taskId || ''))
        )
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    next.userNotifications = notifDocs
      .map((d) => mapDocToNotification({ id: d.id, ...d.data }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    next.auditLogs = auditDocs
      .map((d) => mapDocToAuditLog({ id: d.id, ...d.data }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    // Reconcile welcome bonus claims from users + creditTransactions when welcome_bonus_claims is server-only
    const claimMap = new Map<string, WelcomeBonusClaimRecord>();
    for (const c of baseDb.welcomeBonusClaims) {
      if (c.googleSub) claimMap.set(c.googleSub, c);
    }
    for (const u of users) {
      if (u.welcomeBonusClaimed) {
        const key = u.googleSub || u.uid;
        if (!claimMap.has(key)) {
          claimMap.set(key, {
            googleSub: key,
            userId: u.uid,
            email: u.email,
            amountAwarded: Number(u.welcomeBonusAmount) || 5000,
            creditTransactionId: '',
            claimedAt: u.welcomeBonusAwardedAt || u.createdAt,
          });
        }
      }
    }
    for (const tx of next.creditTransactions) {
      if (tx.type === 'signup_bonus') {
        const u = usersById.get(tx.userId);
        const key = tx.googleSub || u?.googleSub || tx.userId;
        if (!claimMap.has(key)) {
          claimMap.set(key, {
            googleSub: key,
            userId: tx.userId,
            email: u?.email || tx.userEmail || '',
            amountAwarded: Number(tx.amount) || 0,
            creditTransactionId: tx.id,
            claimedAt: tx.createdAt,
          });
        }
      }
    }
    next.welcomeBonusClaims = Array.from(claimMap.values());

    return { db: next, mode: 'id-token' };
  }

  // Regular authenticated Firebase user: hydrate their own user doc + owned records
  if (ctx?.uid) {
    const uid = sanitizeFirestoreId(ctx.uid, 'usr');
    const [pubDoc, privDoc, userPayments, userReceipts, userTx, userProjects, userSpeeches, userNotifs] =
      await Promise.all([
        restGetDoc(cfg, `users/${uid}`, idToken),
        restGetDoc(cfg, `users/${uid}/private/info`, idToken),
        restQueryByUserId(cfg, 'payment_requests', uid, idToken, 200),
        restQueryByUserId(cfg, 'payment_receipts', uid, idToken, 200),
        restQueryByUserId(cfg, 'credit_transactions', uid, idToken, 200),
        restQueryByUserId(cfg, 'projects', uid, idToken, 200),
        restQueryByUserId(cfg, 'speech_history', uid, idToken, 300),
        restQueryByUserId(cfg, 'notifications', uid, idToken, 100),
      ]);

    const usersById = new Map(next.users.map((u) => [u.uid, u]));
    if (pubDoc) {
      const hydratedUser = mapFirestoreToUser({ uid, ...pubDoc.data }, privDoc?.data || null);
      usersById.set(uid, hydratedUser);
      next.users = Array.from(usersById.values());
    }

    const mergeById = <T>(
      existing: T[],
      incoming: T[],
      getId: (item: T) => string,
      isOwned: (item: T) => boolean
    ): T[] => {
      const kept = existing.filter((x) => !isOwned(x));
      const map = new Map<string, T>();
      for (const item of [...incoming, ...kept]) {
        map.set(getId(item), item);
      }
      return Array.from(map.values());
    };

    const parsedReceipts = userReceipts.map((d) => mapDocToReceipt({ paymentId: d.id, ...d.data }));
    next.paymentReceipts = mergeById(
      next.paymentReceipts,
      parsedReceipts,
      (r) => r.paymentId,
      (r) => r.userId === uid
    );
    const receiptIds = new Set(next.paymentReceipts.map((r) => r.paymentId));

    next.paymentRequests = mergeById(
      next.paymentRequests,
      userPayments.map((d) => mapDocToPayment({ id: d.id, ...d.data }, usersById, receiptIds)),
      (p) => p.id,
      (p) => p.userId === uid
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    next.creditTransactions = mergeById(
      next.creditTransactions,
      userTx.map((d) => mapDocToCreditTx({ id: d.id, ...d.data }, usersById)),
      (t) => t.id,
      (t) => t.userId === uid
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    next.projects = mergeById(
      next.projects,
      userProjects.map((d) => mapDocToProject({ id: d.id, ...d.data }, usersById)),
      (p) => p.id,
      (p) => p.userId === uid
    ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    next.speechHistory = mergeById(
      next.speechHistory,
      userSpeeches.map((d) =>
        mapDocToSpeech(
          { id: d.id, ...d.data },
          usersById,
          localTranscriptByTaskId.get(d.id) || localTranscriptByTaskId.get(String(d.data.taskId || ''))
        )
      ),
      (s) => s.id,
      (s) => s.userId === uid
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    next.userNotifications = mergeById(
      next.userNotifications,
      userNotifs.map((d) => mapDocToNotification({ id: d.id, ...d.data })),
      (n) => n.id,
      (n) => n.userId === uid
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return { db: next, mode: 'id-token' };
  }

  return { db: next, mode: 'public-rest' };
}

// ---------------------------------------------------------------------------
// Persist Diffs Atomically to Firestore (Strict Error Propagation)
// ---------------------------------------------------------------------------
function diffMaps<T>(prevList: T[], nextList: T[], getId: (item: T) => string) {
  const prevMap = new Map<string, T>();
  for (const item of prevList) prevMap.set(getId(item), item);
  const nextMap = new Map<string, T>();
  for (const item of nextList) nextMap.set(getId(item), item);

  const created: T[] = [];
  const updated: { prev: T; next: T }[] = [];
  const deleted: T[] = [];

  for (const [id, item] of nextMap.entries()) {
    const prevItem = prevMap.get(id);
    if (!prevItem) {
      created.push(item);
    } else if (stableJson(prevItem) !== stableJson(item)) {
      updated.push({ prev: prevItem, next: item });
    }
  }
  for (const [id, item] of prevMap.entries()) {
    if (!nextMap.has(id)) {
      deleted.push(item);
    }
  }
  return { created, updated, deleted };
}

export async function persistSpeaklyDiffToFirestore(params: {
  adminDb: AdminFirestore | null;
  prev: SpeaklyDatabase;
  next: SpeaklyDatabase;
  ctx?: FirestoreContext;
}): Promise<void> {
  const { adminDb, prev, next, ctx } = params;
  const cfg = getFirebaseProjectConfig();
  if (!cfg) return;

  const userDiff = diffMaps(prev.users, next.users, (u) => u.uid);
  const planDiff = diffMaps(prev.pricingPlans, next.pricingPlans, (p) => p.id);
  const voiceDiff = diffMaps(prev.voiceOverrides, next.voiceOverrides, (v) => v.voiceId);
  const paymentDiff = diffMaps(prev.paymentRequests, next.paymentRequests, (p) => p.id);
  const receiptDiff = diffMaps(prev.paymentReceipts, next.paymentReceipts, (r) => r.paymentId);
  const txDiff = diffMaps(prev.creditTransactions, next.creditTransactions, (t) => t.id);
  const projectDiff = diffMaps(prev.projects, next.projects, (p) => p.id);
  const speechDiff = diffMaps(prev.speechHistory, next.speechHistory, (s) => s.id);
  const notifDiff = diffMaps(prev.userNotifications, next.userNotifications, (n) => n.id);
  const auditDiff = diffMaps(prev.auditLogs, next.auditLogs, (a) => a.id);
  const settingsChanged = stableJson(prev.platformSettings) !== stableJson(next.platformSettings);

  const adminAccountDiff = diffMaps(prev.adminAccounts, next.adminAccounts, (a) => a.id);
  const integrationDiff = diffMaps(prev.apiIntegrations, next.apiIntegrations, (i) => i.id);
  const claimDiff = diffMaps(prev.welcomeBonusClaims, next.welcomeBonusClaims, (c) => c.googleSub);

  // MODE A: Server Admin SDK (writes everything atomically)
  if (adminDb) {
    type BatchOp = (batch: FirebaseFirestore.WriteBatch) => void;
    const ops: BatchOp[] = [];

    for (const u of userDiff.created) {
      const uid = sanitizeFirestoreId(u.uid, 'usr');
      const pubDoc = {
        ...mapUserToPublicDoc(u),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      const privDoc = {
        ...mapUserToPrivateDoc(u),
        updatedAt: FieldValue.serverTimestamp(),
      };
      ops.push((b) => b.set(adminDb.collection('users').doc(uid), pubDoc));
      ops.push((b) =>
        b.set(adminDb.collection('users').doc(uid).collection('private').doc('info'), privDoc)
      );
    }
    for (const { prev: pU, next: nU } of userDiff.updated) {
      const uid = sanitizeFirestoreId(nU.uid, 'usr');
      const prevPub = mapUserToPublicDoc(pU);
      const nextPub = mapUserToPublicDoc(nU);
      if (stableJson(prevPub) !== stableJson(nextPub)) {
        const updatePub = { ...nextPub };
        delete updatePub.createdAt;
        updatePub.updatedAt = FieldValue.serverTimestamp();
        ops.push((b) => b.set(adminDb.collection('users').doc(uid), updatePub, { merge: true }));
      }
      const prevPriv = mapUserToPrivateDoc(pU);
      const nextPriv = mapUserToPrivateDoc(nU);
      if (stableJson(prevPriv) !== stableJson(nextPriv)) {
        ops.push((b) =>
          b.set(
            adminDb.collection('users').doc(uid).collection('private').doc('info'),
            { ...nextPriv, updatedAt: FieldValue.serverTimestamp() },
            { merge: true }
          )
        );
      }
    }
    for (const u of userDiff.deleted) {
      const uid = sanitizeFirestoreId(u.uid, 'usr');
      ops.push((b) => b.delete(adminDb.collection('users').doc(uid).collection('private').doc('info')));
      ops.push((b) => b.delete(adminDb.collection('users').doc(uid)));
    }

    for (const p of planDiff.created) {
      const id = sanitizeFirestoreId(p.id, 'plan');
      ops.push((b) =>
        b.set(adminDb.collection('pricing_plans').doc(id), {
          ...mapPlanToDoc(p),
          updatedAt: FieldValue.serverTimestamp(),
        })
      );
    }
    for (const { next: p } of planDiff.updated) {
      const id = sanitizeFirestoreId(p.id, 'plan');
      ops.push((b) =>
        b.set(adminDb.collection('pricing_plans').doc(id), {
          ...mapPlanToDoc(p),
          updatedAt: FieldValue.serverTimestamp(),
        })
      );
    }
    for (const p of planDiff.deleted) {
      ops.push((b) => b.delete(adminDb.collection('pricing_plans').doc(sanitizeFirestoreId(p.id, 'plan'))));
    }

    if (settingsChanged) {
      ops.push((b) =>
        b.set(adminDb.collection('platform_public').doc('settings'), {
          ...mapPlatformSettingsToDoc(next.platformSettings),
          updatedAt: FieldValue.serverTimestamp(),
        })
      );
    }

    for (const v of [...voiceDiff.created, ...voiceDiff.updated.map((u) => u.next)]) {
      const id = sanitizeFirestoreId(v.voiceId, 'voice');
      ops.push((b) =>
        b.set(adminDb.collection('voice_overrides').doc(id), {
          ...mapVoiceOverrideToDoc(v),
          updatedAt: FieldValue.serverTimestamp(),
        })
      );
    }
    for (const v of voiceDiff.deleted) {
      ops.push((b) =>
        b.delete(adminDb.collection('voice_overrides').doc(sanitizeFirestoreId(v.voiceId, 'voice')))
      );
    }

    for (const p of paymentDiff.created) {
      const id = sanitizeFirestoreId(p.id, 'pay');
      ops.push((b) =>
        b.set(adminDb.collection('payment_requests').doc(id), {
          ...mapPaymentToDoc(p),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
      );
    }
    for (const { next: p } of paymentDiff.updated) {
      const id = sanitizeFirestoreId(p.id, 'pay');
      const doc = mapPaymentToDoc(p);
      delete doc.createdAt;
      doc.updatedAt = FieldValue.serverTimestamp();
      ops.push((b) => b.set(adminDb.collection('payment_requests').doc(id), doc, { merge: true }));
    }
    for (const p of paymentDiff.deleted) {
      ops.push((b) =>
        b.delete(adminDb.collection('payment_requests').doc(sanitizeFirestoreId(p.id, 'pay')))
      );
    }

    for (const r of receiptDiff.created) {
      const id = sanitizeFirestoreId(r.paymentId, 'pay');
      ops.push((b) =>
        b.set(adminDb.collection('payment_receipts').doc(id), {
          ...mapReceiptToDoc(r),
          createdAt: FieldValue.serverTimestamp(),
        })
      );
    }
    for (const r of receiptDiff.deleted) {
      ops.push((b) =>
        b.delete(adminDb.collection('payment_receipts').doc(sanitizeFirestoreId(r.paymentId, 'pay')))
      );
    }

    for (const t of txDiff.created) {
      const id = sanitizeFirestoreId(t.id, 'ctx');
      ops.push((b) =>
        b.set(adminDb.collection('credit_transactions').doc(id), {
          ...mapCreditTxToDoc(t),
          createdAt: FieldValue.serverTimestamp(),
        })
      );
    }

    for (const p of projectDiff.created) {
      const id = sanitizeFirestoreId(p.id, 'proj');
      ops.push((b) =>
        b.set(adminDb.collection('projects').doc(id), {
          ...mapProjectToDoc(p),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
      );
    }
    for (const { next: p } of projectDiff.updated) {
      const id = sanitizeFirestoreId(p.id, 'proj');
      const doc = mapProjectToDoc(p);
      delete doc.createdAt;
      doc.updatedAt = FieldValue.serverTimestamp();
      ops.push((b) => b.set(adminDb.collection('projects').doc(id), doc, { merge: true }));
    }
    for (const p of projectDiff.deleted) {
      ops.push((b) => b.delete(adminDb.collection('projects').doc(sanitizeFirestoreId(p.id, 'proj'))));
    }

    for (const s of speechDiff.created) {
      const id = sanitizeFirestoreId(s.id, 'gen');
      ops.push((b) =>
        b.set(adminDb.collection('speech_history').doc(id), {
          ...mapSpeechToDoc(s),
          createdAt: FieldValue.serverTimestamp(),
        })
      );
    }
    for (const s of speechDiff.deleted) {
      ops.push((b) =>
        b.delete(adminDb.collection('speech_history').doc(sanitizeFirestoreId(s.id, 'gen')))
      );
    }

    for (const n of notifDiff.created) {
      const id = sanitizeFirestoreId(n.id, 'notif');
      ops.push((b) =>
        b.set(adminDb.collection('notifications').doc(id), {
          ...mapNotificationToDoc(n),
          createdAt: FieldValue.serverTimestamp(),
        })
      );
    }
    for (const { next: n } of notifDiff.updated) {
      const id = sanitizeFirestoreId(n.id, 'notif');
      ops.push((b) =>
        b.update(adminDb.collection('notifications').doc(id), { read: Boolean(n.read) })
      );
    }
    for (const n of notifDiff.deleted) {
      ops.push((b) =>
        b.delete(adminDb.collection('notifications').doc(sanitizeFirestoreId(n.id, 'notif')))
      );
    }

    for (const a of auditDiff.created) {
      const id = sanitizeFirestoreId(a.id, 'aud');
      ops.push((b) =>
        b.set(adminDb.collection('audit_logs').doc(id), {
          ...mapAuditLogToDoc(a),
          createdAt: FieldValue.serverTimestamp(),
        })
      );
    }

    for (const a of [...adminAccountDiff.created, ...adminAccountDiff.updated.map((u) => u.next)]) {
      const id = sanitizeFirestoreId(a.id, 'adm');
      ops.push((b) => b.set(adminDb.collection('admin_accounts').doc(id), stripUndefined(a)));
    }
    for (const a of adminAccountDiff.deleted) {
      ops.push((b) => b.delete(adminDb.collection('admin_accounts').doc(sanitizeFirestoreId(a.id, 'adm'))));
    }

    for (const i of [...integrationDiff.created, ...integrationDiff.updated.map((u) => u.next)]) {
      const id = sanitizeFirestoreId(i.id, 'int');
      ops.push((b) => b.set(adminDb.collection('api_integrations').doc(id), stripUndefined(i)));
    }
    for (const i of integrationDiff.deleted) {
      ops.push((b) =>
        b.delete(adminDb.collection('api_integrations').doc(sanitizeFirestoreId(i.id, 'int')))
      );
    }

    for (const c of claimDiff.created) {
      const id = sanitizeFirestoreId(c.googleSub, 'claim');
      ops.push((b) => b.set(adminDb.collection('welcome_bonus_claims').doc(id), stripUndefined(c)));
    }

    for (let i = 0; i < ops.length; i += 400) {
      const batch = adminDb.batch();
      for (const fn of ops.slice(i, i + 400)) fn(batch);
      await batch.commit();
    }
    return;
  }

  // MODE B: Firestore REST API v1 using verified Firebase ID Token
  const idToken = ctx?.firebaseIdToken;
  if (!idToken) {
    if (ctx?.requireFirestore && !ctx?.allowLocalFallback) {
      throw Object.assign(
        new Error(
          'Firestore persistence requires Firebase authentication (Sign in with Google or set FIREBASE_SERVICE_ACCOUNT_JSON on the server).'
        ),
        { statusCode: 503, code: 'FIRESTORE_AUTH_REQUIRED' }
      );
    }
    return;
  }

  const isAdmin = Boolean(ctx?.isAdminToken);
  const writes: RestWriteSpec[] = [];

  // 1. User create / update / delete
  for (const u of userDiff.created) {
    const uid = sanitizeFirestoreId(u.uid, 'usr');
    if (isAdmin || ctx?.uid === uid) {
      writes.push({
        type: 'create',
        docPath: `users/${uid}`,
        fields: mapUserToPublicDoc(u),
        serverTimestampFields: ['createdAt', 'updatedAt'],
      });
      writes.push({
        type: 'create',
        docPath: `users/${uid}/private/info`,
        fields: mapUserToPrivateDoc(u),
        serverTimestampFields: ['updatedAt'],
      });
    }
  }

  for (const { prev: pU, next: nU } of userDiff.updated) {
    const uid = sanitizeFirestoreId(nU.uid, 'usr');
    const prevPub = mapUserToPublicDoc(pU);
    const nextPub = mapUserToPublicDoc(nU);

    if (isAdmin) {
      if (stableJson(prevPub) !== stableJson(nextPub)) {
        const updateFields = Object.keys(nextPub).filter(
          (k) => k !== 'createdAt' && k !== 'updatedAt'
        );
        writes.push({
          type: 'update',
          docPath: `users/${uid}`,
          fields: nextPub,
          updateMaskFields: updateFields,
          serverTimestampFields: ['updatedAt'],
        });
      }
      const prevPriv = mapUserToPrivateDoc(pU);
      const nextPriv = mapUserToPrivateDoc(nU);
      if (stableJson(prevPriv) !== stableJson(nextPriv)) {
        writes.push({
          type: 'update',
          docPath: `users/${uid}/private/info`,
          fields: nextPriv,
          updateMaskFields: Object.keys(nextPriv).filter((k) => k !== 'updatedAt'),
          serverTimestampFields: ['updatedAt'],
        });
      }
    } else if (ctx?.uid === uid) {
      // Non-admin owner updates: firestore.rules limits `users/{uid}` update to ['displayName', 'avatarUrl', 'lastLoginAt', 'updatedAt']
      const allowedOwnerKeys = ['displayName', 'avatarUrl', 'lastLoginAt'] as const;
      const changedOwnerKeys = allowedOwnerKeys.filter(
        (k) => stableJson(prevPub[k]) !== stableJson(nextPub[k])
      );
      if (changedOwnerKeys.length > 0) {
        writes.push({
          type: 'update',
          docPath: `users/${uid}`,
          fields: nextPub,
          updateMaskFields: [...changedOwnerKeys],
          serverTimestampFields: ['updatedAt'],
        });
      }
      const prevPriv = mapUserToPrivateDoc(pU);
      const nextPriv = mapUserToPrivateDoc(nU);
      if (stableJson(prevPriv) !== stableJson(nextPriv)) {
        writes.push({
          type: 'update',
          docPath: `users/${uid}/private/info`,
          fields: nextPriv,
          updateMaskFields: Object.keys(nextPriv).filter((k) => k !== 'updatedAt'),
          serverTimestampFields: ['updatedAt'],
        });
      }
    }
  }

  if (isAdmin) {
    for (const u of userDiff.deleted) {
      const uid = sanitizeFirestoreId(u.uid, 'usr');
      writes.push({ type: 'delete', docPath: `users/${uid}/private/info` });
      writes.push({ type: 'delete', docPath: `users/${uid}` });
    }
  }

  // 2. Admin-managed collections (pricing_plans, platform_public/settings, voice_overrides, credit_transactions, audit_logs)
  if (isAdmin) {
    for (const p of planDiff.created) {
      const doc = mapPlanToDoc(p);
      writes.push({
        type: 'create',
        docPath: `pricing_plans/${sanitizeFirestoreId(p.id, 'plan')}`,
        fields: doc,
        serverTimestampFields: ['updatedAt'],
      });
    }
    for (const { next: p } of planDiff.updated) {
      const doc = mapPlanToDoc(p);
      writes.push({
        type: 'update',
        docPath: `pricing_plans/${sanitizeFirestoreId(p.id, 'plan')}`,
        fields: doc,
        updateMaskFields: Object.keys(doc).filter((k) => k !== 'updatedAt'),
        serverTimestampFields: ['updatedAt'],
      });
    }
    for (const p of planDiff.deleted) {
      writes.push({
        type: 'delete',
        docPath: `pricing_plans/${sanitizeFirestoreId(p.id, 'plan')}`,
      });
    }

    if (settingsChanged) {
      const doc = mapPlatformSettingsToDoc(next.platformSettings);
      writes.push({
        type: 'update',
        docPath: 'platform_public/settings',
        fields: doc,
        updateMaskFields: Object.keys(doc).filter((k) => k !== 'updatedAt'),
        serverTimestampFields: ['updatedAt'],
      });
    }

    for (const v of voiceDiff.created) {
      const doc = mapVoiceOverrideToDoc(v);
      writes.push({
        type: 'create',
        docPath: `voice_overrides/${sanitizeFirestoreId(v.voiceId, 'voice')}`,
        fields: doc,
        serverTimestampFields: ['updatedAt'],
      });
    }
    for (const { next: v } of voiceDiff.updated) {
      const doc = mapVoiceOverrideToDoc(v);
      writes.push({
        type: 'update',
        docPath: `voice_overrides/${sanitizeFirestoreId(v.voiceId, 'voice')}`,
        fields: doc,
        updateMaskFields: Object.keys(doc).filter((k) => k !== 'updatedAt'),
        serverTimestampFields: ['updatedAt'],
      });
    }
    for (const v of voiceDiff.deleted) {
      writes.push({
        type: 'delete',
        docPath: `voice_overrides/${sanitizeFirestoreId(v.voiceId, 'voice')}`,
      });
    }

    for (const t of txDiff.created) {
      writes.push({
        type: 'create',
        docPath: `credit_transactions/${sanitizeFirestoreId(t.id, 'ctx')}`,
        fields: mapCreditTxToDoc(t),
        serverTimestampFields: ['createdAt'],
      });
    }

    for (const a of auditDiff.created) {
      writes.push({
        type: 'create',
        docPath: `audit_logs/${sanitizeFirestoreId(a.id, 'aud')}`,
        fields: mapAuditLogToDoc(a),
        serverTimestampFields: ['createdAt'],
      });
    }
  }

  // 3. Payment requests & atomic payment receipts (`payment_requests` must precede or share batch with `payment_receipts`)
  for (const p of paymentDiff.created) {
    if (isAdmin || ctx?.uid === p.userId) {
      writes.push({
        type: 'create',
        docPath: `payment_requests/${sanitizeFirestoreId(p.id, 'pay')}`,
        fields: mapPaymentToDoc(p),
        serverTimestampFields: ['createdAt', 'updatedAt'],
      });
    }
  }
  for (const r of receiptDiff.created) {
    if (isAdmin || ctx?.uid === r.userId) {
      writes.push({
        type: 'create',
        docPath: `payment_receipts/${sanitizeFirestoreId(r.paymentId, 'pay')}`,
        fields: mapReceiptToDoc(r),
        serverTimestampFields: ['createdAt'],
      });
    }
  }
  for (const { next: p } of paymentDiff.updated) {
    const id = sanitizeFirestoreId(p.id, 'pay');
    const doc = mapPaymentToDoc(p);
    if (isAdmin) {
      writes.push({
        type: 'update',
        docPath: `payment_requests/${id}`,
        fields: doc,
        updateMaskFields: Object.keys(doc).filter((k) => k !== 'createdAt' && k !== 'updatedAt'),
        serverTimestampFields: ['updatedAt'],
      });
    } else if (ctx?.uid === p.userId && p.status === 'cancelled') {
      writes.push({
        type: 'update',
        docPath: `payment_requests/${id}`,
        fields: { status: 'cancelled' },
        updateMaskFields: ['status'],
        serverTimestampFields: ['updatedAt'],
      });
    }
  }
  if (isAdmin) {
    for (const p of paymentDiff.deleted) {
      writes.push({
        type: 'delete',
        docPath: `payment_requests/${sanitizeFirestoreId(p.id, 'pay')}`,
      });
    }
    for (const r of receiptDiff.deleted) {
      writes.push({
        type: 'delete',
        docPath: `payment_receipts/${sanitizeFirestoreId(r.paymentId, 'pay')}`,
      });
    }
  }

  // 4. Projects
  for (const p of projectDiff.created) {
    if (isAdmin || ctx?.uid === p.userId) {
      writes.push({
        type: 'create',
        docPath: `projects/${sanitizeFirestoreId(p.id, 'proj')}`,
        fields: mapProjectToDoc(p),
        serverTimestampFields: ['createdAt', 'updatedAt'],
      });
    }
  }
  for (const { next: p } of projectDiff.updated) {
    if (isAdmin || ctx?.uid === p.userId) {
      const doc = mapProjectToDoc(p);
      writes.push({
        type: 'update',
        docPath: `projects/${sanitizeFirestoreId(p.id, 'proj')}`,
        fields: doc,
        updateMaskFields: Object.keys(doc).filter(
          (k) => k !== 'id' && k !== 'userId' && k !== 'createdAt' && k !== 'updatedAt'
        ),
        serverTimestampFields: ['updatedAt'],
      });
    }
  }
  for (const p of projectDiff.deleted) {
    if (isAdmin || ctx?.uid === p.userId) {
      writes.push({
        type: 'delete',
        docPath: `projects/${sanitizeFirestoreId(p.id, 'proj')}`,
      });
    }
  }

  // 5. Speech history
  for (const s of speechDiff.created) {
    if (isAdmin || ctx?.uid === s.userId) {
      writes.push({
        type: 'create',
        docPath: `speech_history/${sanitizeFirestoreId(s.id, 'gen')}`,
        fields: mapSpeechToDoc(s),
        serverTimestampFields: ['createdAt'],
      });
    }
  }
  for (const s of speechDiff.deleted) {
    if (isAdmin || ctx?.uid === s.userId) {
      writes.push({
        type: 'delete',
        docPath: `speech_history/${sanitizeFirestoreId(s.id, 'gen')}`,
      });
    }
  }

  // 6. Notifications
  if (isAdmin) {
    for (const n of notifDiff.created) {
      writes.push({
        type: 'create',
        docPath: `notifications/${sanitizeFirestoreId(n.id, 'notif')}`,
        fields: mapNotificationToDoc(n),
        serverTimestampFields: ['createdAt'],
      });
    }
    for (const n of notifDiff.deleted) {
      writes.push({
        type: 'delete',
        docPath: `notifications/${sanitizeFirestoreId(n.id, 'notif')}`,
      });
    }
  }
  for (const { next: n } of notifDiff.updated) {
    if (isAdmin || ctx?.uid === n.userId) {
      writes.push({
        type: 'update',
        docPath: `notifications/${sanitizeFirestoreId(n.id, 'notif')}`,
        fields: { read: Boolean(n.read) },
        updateMaskFields: ['read'],
      });
    }
  }

  if (writes.length > 0) {
    await restCommitWrites(cfg, writes, idToken);
  }
}
