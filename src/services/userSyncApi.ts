import { getFirebaseIdToken } from '../firebase.js';
import { Project } from '../types/index.js';

export interface PublicPricingPlan {
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
}

export interface PublicPlatformSettings {
  siteName: string;
  logoUrl: string;
  faviconUrl: string;
  supportEmail: string;
  contactInfo: string;
  defaultCredits: number;
  signupBonusEnabled?: boolean;
  signupBonusCredits?: number;
  defaultPlanId: string;
  allowRegistration: boolean;
  creditCostPer1kChars: number;
  transcriptSurchargePercent?: number;
  paymentInstructions: string;
  acceptedPaymentMethods: string[];
  maxTextChars: number;
  supportedLanguages: string[];
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

export interface PublicBootstrapResponse {
  success: boolean;
  isConfigured: boolean;
  plans: PublicPricingPlan[];
  settings: PublicPlatformSettings;
}

export interface UserPaymentRequestItem {
  id: string;
  userId: string;
  planId: string;
  planName: string;
  billingCycle: 'monthly' | 'yearly';
  amountUsd: number;
  creditsToGrant: number;
  paymentMethod: string;
  transactionId: string;
  hasReceipt: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  rejectionReason?: string;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncedUserPayload {
  user: {
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
    authProvider?: 'google' | 'password' | 'other';
    googleSub?: string | null;
    welcomeBonusClaimed?: boolean;
    welcomeBonusAmount?: number;
    welcomeBonusAwardedAt?: string | null;
  };
  isNewUser?: boolean;
  bonusAwarded?: boolean;
  bonusAmount?: number;
  welcomeMessage?: string | null;
  projects: Project[];
  speechHistory: any[];
  creditTransactions: any[];
  paymentRequests: UserPaymentRequestItem[];
  notifications: any[];
}

async function authFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = await getFirebaseIdToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchPublicBootstrap(): Promise<PublicBootstrapResponse> {
  const res = await fetch('/api/public/bootstrap');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load platform configuration.');
  return data as PublicBootstrapResponse;
}

export async function syncSignedInUser(guestProjects: Project[] = []): Promise<SyncedUserPayload> {
  return authFetch<SyncedUserPayload>('/api/user/sync', {
    method: 'POST',
    body: JSON.stringify({ guestProjects }),
  });
}

export async function updateSyncedProfile(payload: {
  displayName?: string;
  defaultLanguage?: string;
  defaultSpeed?: number;
  notifyOnComplete?: boolean;
  notifyAccountAlerts?: boolean;
}) {
  return authFetch<{ success: boolean; user: SyncedUserPayload['user'] }>('/api/user/profile', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function saveSyncedProject(project: Project) {
  return authFetch<{ success: boolean; project: Project }>('/api/user/projects', {
    method: 'POST',
    body: JSON.stringify(project),
  });
}

export async function deleteSyncedProject(projectId: string) {
  return authFetch<{ success: boolean }>(`/api/user/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
}

export async function submitPaymentRequest(payload: {
  planId: string;
  billingCycle: 'monthly' | 'yearly';
  paymentMethod: string;
  transactionId: string;
  receiptDataUrl?: string;
}) {
  return authFetch<{ success: boolean; payment: UserPaymentRequestItem }>('/api/user/payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function cancelPaymentRequest(paymentId: string) {
  return authFetch<{ success: boolean; payment: UserPaymentRequestItem }>(
    `/api/user/payments/${encodeURIComponent(paymentId)}/cancel`,
    { method: 'POST' }
  );
}

export async function markAllUserNotificationsRead() {
  return authFetch<{ success: boolean }>('/api/user/notifications/read-all', {
    method: 'POST',
  });
}
