export type AdminSectionId =
  | 'dashboard'
  | 'users'
  | 'credits'
  | 'payments'
  | 'plans'
  | 'api'
  | 'projects'
  | 'history'
  | 'voices'
  | 'accounts'
  | 'audit'
  | 'settings';

export type AdminRole =
  | 'Super Admin'
  | 'Finance Manager'
  | 'Support Manager'
  | 'Content Manager';

export interface AdminAccountPublic {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  permissions: string[];
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAuthStatus {
  success: boolean;
  superAdminConfigured: boolean;
  authenticated: boolean;
  admin: AdminAccountPublic | null;
  databaseMode: string;
}

export interface AdminOverviewData {
  kpis: {
    totalUsers: number;
    activeUsers: number;
    suspendedUsers: number;
    totalCreditsPurchased: number;
    totalCreditsConsumed: number;
    totalRemainingCredits: number;
    totalRevenueUsd: number;
    pendingPayments: number;
    approvedPayments: number;
    rejectedPayments: number;
    activeSubscriptions: number;
    totalSpeechGenerations: number;
    totalProjects: number;
    totalApiCalls: number;
    totalEstimatedApiCostUsd: number;
    recentApiErrorsCount: number;
    totalWelcomeCreditsDistributed: number;
    welcomeBonusRecipientsCount: number;
  };
  charts: {
    revenueOverTime: { date: string; value: number }[];
    registrationTrends: { date: string; value: number }[];
    creditConsumption: { date: string; value: number }[];
    speechActivity: { date: string; value: number }[];
    subscriptionDistribution: { label: string; value: number }[];
  };
  recentRegistrations: AdminUserRecord[];
  recentTransactions: AdminPaymentRecord[];
  recentActivities: AdminAuditLogRecord[];
}

export interface AdminUserRecord {
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
  authProvider?: 'google' | 'password' | 'other';
  googleSub?: string | null;
  welcomeBonusClaimed?: boolean;
  welcomeBonusAmount?: number;
  welcomeBonusAwardedAt?: string | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
}

export interface AdminCreditTransaction {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  previousBalance: number;
  amount: number;
  newBalance: number;
  type: string;
  reason: string;
  note?: string;
  adminId?: string;
  adminEmail?: string;
  relatedPaymentId?: string;
  googleSub?: string | null;
  createdAt: string;
}

export interface AdminPaymentRecord {
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
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  adminNote?: string;
  rejectionReason?: string;
  reviewedByEmail?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPlanRecord {
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

export interface AdminIntegrationRecord {
  id: string;
  providerName: string;
  providerType: 'openspeaker' | 'elevenlabs' | 'custom';
  endpointUrl: string;
  modelName: string;
  maskedKey: string;
  hasKey: boolean;
  isEnabled: boolean;
  isPrimary: boolean;
  rateLimitPerMin: number;
  usageCount: number;
  totalEstimatedCostUsd: number;
  lastTestedAt?: string | null;
  lastStatus: 'connected' | 'degraded' | 'error' | 'untested';
  lastStatusMessage?: string;
  recentErrors: {
    id: string;
    message: string;
    statusCode: number;
    endpoint: string;
    createdAt: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminProjectRecord {
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
  status: 'active' | 'archived';
  generationsCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSpeechRecord {
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
  fileName?: string;
  audioUrl?: string | null;
  creditCost: number;
  estimatedDurationSec: number;
  status: 'completed' | 'simulated' | 'failed';
  errorMessage?: string | null;
  createdAt: string;
}

export interface AdminVoiceRecord {
  id: string;
  name: string;
  category?: string;
  description?: string;
  previewUrl?: string | null;
  gender?: string;
  accent?: string;
  language?: string;
  enabled: boolean;
  allowedPlans: string[];
  isCustomAdded: boolean;
}

export interface AdminAuditLogRecord {
  id: string;
  adminId: string;
  adminEmail: string;
  adminRole: string;
  action: string;
  targetType: string;
  targetId: string;
  previousValue?: unknown;
  newValue?: unknown;
  ipAddress: string;
  createdAt: string;
}

export interface AdminPlatformSettings {
  siteName: string;
  logoUrl: string;
  faviconUrl: string;
  supportEmail: string;
  contactInfo: string;
  defaultCredits: number;
  signupBonusEnabled: boolean;
  signupBonusCredits: number;
  defaultPlanId: string;
  allowRegistration: boolean;
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
