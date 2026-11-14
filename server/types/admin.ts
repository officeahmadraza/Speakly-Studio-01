import type { WordAlignedTranscript } from '../../shared/creditPricing.js';

export type AdminRole =
  | 'Super Admin'
  | 'Finance Manager'
  | 'Support Manager'
  | 'Content Manager';

export type AdminPermission =
  | '*'
  | 'dashboard:view'
  | 'users:view'
  | 'users:manage'
  | 'users:delete'
  | 'credits:view'
  | 'credits:manage'
  | 'payments:view'
  | 'payments:manage'
  | 'plans:view'
  | 'plans:manage'
  | 'api:view'
  | 'api:manage'
  | 'projects:view'
  | 'projects:manage'
  | 'history:view'
  | 'history:manage'
  | 'voices:view'
  | 'voices:manage'
  | 'admins:view'
  | 'admins:manage'
  | 'audit:view'
  | 'settings:view'
  | 'settings:manage'
  | 'settings:branding';

export const ROLE_PERMISSIONS_MAP: Record<AdminRole, AdminPermission[]> = {
  'Super Admin': ['*'],
  'Finance Manager': [
    'dashboard:view',
    'users:view',
    'credits:view',
    'credits:manage',
    'payments:view',
    'payments:manage',
    'plans:view',
    'plans:manage',
    'audit:view',
  ],
  'Support Manager': [
    'dashboard:view',
    'users:view',
    'users:manage',
    'credits:view',
    'credits:manage',
    'payments:view',
    'projects:view',
    'history:view',
    'history:manage',
  ],
  'Content Manager': [
    'dashboard:view',
    'voices:view',
    'voices:manage',
    'projects:view',
    'projects:manage',
    'history:view',
    'settings:view',
    'settings:branding',
  ],
};

export interface AdminAccount {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  permissions: AdminPermission[];
  passwordHash: string;
  passwordSalt: string;
  isActive: boolean;
  mustChangePassword: boolean;
  resetTokenHash?: string | null;
  resetTokenExpiresAt?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSession {
  id: string;
  adminId: string;
  email: string;
  role: AdminRole;
  ipAddress: string;
  userAgent: string;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
}

export interface DbUser {
  uid: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  status: 'active' | 'suspended';
  planId: string;
  planName: string;
  billingCycle: 'monthly' | 'yearly' | 'lifetime';
  subscriptionExpiresAt?: string | null;
  remainingCredits: number;
  totalPurchasedCredits: number;
  totalConsumedCredits: number;
  defaultLanguage: string;
  defaultSpeed: number;
  notifyOnComplete: boolean;
  notifyAccountAlerts: boolean;
  notes?: string;
  authProvider?: 'google' | 'other';
  googleSub?: string;
  welcomeBonusClaimed?: boolean;
  welcomeBonusAmount?: number;
  welcomeBonusAwardedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
}

export interface WelcomeBonusClaimRecord {
  googleSub: string;
  userId: string;
  email: string;
  amountAwarded: number;
  creditTransactionId: string;
  claimedAt: string;
}

export type CreditTransactionType =
  | 'signup_bonus'
  | 'initial_grant'
  | 'purchase'
  | 'consumption'
  | 'manual_add'
  | 'manual_deduct'
  | 'balance_override'
  | 'refund';

export interface CreditTransactionRecord {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  googleSub?: string;
  previousBalance: number;
  amount: number;
  newBalance: number;
  type: CreditTransactionType;
  reason: string;
  note?: string;
  adminId?: string;
  adminEmail?: string;
  relatedPaymentId?: string;
  createdAt: string;
}

export type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface PaymentRequestRecord {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  planId: string;
  planName: string;
  billingCycle: 'monthly' | 'yearly';
  amountUsd: number;
  creditsToGrant: number;
  paymentMethod: string;
  transactionId: string;
  hasReceipt: boolean;
  status: PaymentStatus;
  adminNote?: string;
  rejectionReason?: string;
  reviewedByAdminId?: string;
  reviewedByEmail?: string;
  reviewedAt?: string;
  creditTransactionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentReceiptRecord {
  paymentId: string;
  userId: string;
  dataUrl: string;
  mimeType: string;
  createdAt: string;
}

export interface PricingPlanRecord {
  id: string;
  name: string;
  audience: string;
  monthlyPrice: number;
  yearlyPrice: number;
  credits: number;
  durationDays: number;
  features: string[];
  isActive: boolean;
  isFeatured: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorLogEntry {
  id: string;
  message: string;
  statusCode: number;
  endpoint: string;
  createdAt: string;
}

export interface ApiIntegrationRecord {
  id: string;
  providerName: string;
  providerType: 'openspeaker' | 'elevenlabs' | 'custom';
  endpointUrl: string;
  modelName: string;
  encryptedApiKey: string;
  maskedKey: string;
  isEnabled: boolean;
  isPrimary: boolean;
  rateLimitPerMin: number;
  usageCount: number;
  totalEstimatedCostUsd: number;
  lastTestedAt?: string | null;
  lastStatus: 'connected' | 'degraded' | 'error' | 'untested';
  lastStatusMessage?: string;
  recentErrors: ApiErrorLogEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface DbProjectRecord {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  name: string;
  description: string;
  script: string;
  voiceId?: string;
  voiceName?: string;
  speed?: number;
  withTranscript?: boolean;
  fileName?: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface DbSpeechHistoryRecord {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  taskId: string;
  voiceId: string;
  voiceName: string;
  language?: string;
  projectId?: string;
  text: string;
  charCount: number;
  wordCount: number;
  speed: number;
  withTranscript: boolean;
  hasTranscript?: boolean;
  transcriptData?: WordAlignedTranscript | null;
  fileName?: string;
  audioUrl?: string | null;
  creditCost: number;
  estimatedDurationSec: number;
  status: 'completed' | 'simulated' | 'failed';
  errorMessage?: string | null;
  createdAt: string;
}

export interface VoiceOverrideRecord {
  voiceId: string;
  enabled: boolean;
  customName?: string;
  customCategory?: string;
  customLanguage?: string;
  customAccent?: string;
  customGender?: string;
  customDescription?: string;
  allowedPlans: string[]; // empty means all plans
  isCustomAdded: boolean;
  customPreviewUrl?: string;
  updatedAt: string;
}

export interface PlatformSettingsRecord {
  siteName: string;
  logoUrl: string;
  faviconUrl: string;
  supportEmail: string;
  contactInfo: string;
  defaultCredits: number;
  defaultPlanId: string;
  allowRegistration: boolean;
  signupBonusEnabled: boolean;
  signupBonusCredits: number;
  creditCostPer1kChars: number;
  transcriptSurchargePercent?: number;
  paymentInstructions: string;
  acceptedPaymentMethods: string[];
  notifyAdminOnNewPayment: boolean;
  notifyUserOnPaymentDecision: boolean;
  maxTextChars: number;
  supportedLanguages: string[];
  maintenanceMode: boolean;
  maintenanceMessage: string;
  updatedAt: string;
}

export interface AuditLogRecord {
  id: string;
  adminId: string;
  adminEmail: string;
  adminRole: string;
  action: string;
  targetType: string;
  targetId: string;
  previousValue?: any;
  newValue?: any;
  ipAddress: string;
  createdAt: string;
}

export interface UserNotificationRecord {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: string;
}

export interface SpeaklyDatabase {
  adminAccounts: AdminAccount[];
  adminSessions: AdminSession[];
  users: DbUser[];
  welcomeBonusClaims: WelcomeBonusClaimRecord[];
  creditTransactions: CreditTransactionRecord[];
  paymentRequests: PaymentRequestRecord[];
  paymentReceipts: PaymentReceiptRecord[];
  pricingPlans: PricingPlanRecord[];
  apiIntegrations: ApiIntegrationRecord[];
  projects: DbProjectRecord[];
  speechHistory: DbSpeechHistoryRecord[];
  voiceOverrides: VoiceOverrideRecord[];
  platformSettings: PlatformSettingsRecord;
  auditLogs: AuditLogRecord[];
  userNotifications: UserNotificationRecord[];
}
