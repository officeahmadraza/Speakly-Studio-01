import { getFirebaseIdToken } from '../firebase.js';
import {
  AdminAuthStatus,
  AdminAccountPublic,
  AdminOverviewData,
  AdminUserRecord,
  AdminCreditTransaction,
  AdminPaymentRecord,
  AdminPlanRecord,
  AdminIntegrationRecord,
  AdminProjectRecord,
  AdminSpeechRecord,
  AdminVoiceRecord,
  AdminAuditLogRecord,
  AdminPlatformSettings,
} from './types.js';

export class AdminApiError extends Error {
  statusCode: number;
  code?: string;
  constructor(message: string, statusCode = 500, code?: string) {
    super(message);
    this.name = 'AdminApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const SESSION_TOKEN_STORAGE_KEY = 'speakly_admin_session_token';
let memorySessionToken: string | null = null;

export function getStoredAdminSessionToken(): string | null {
  if (memorySessionToken) return memorySessionToken;
  try {
    const val = window.sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (val) memorySessionToken = val;
    return val;
  } catch {
    return memorySessionToken;
  }
}

export function setStoredAdminSessionToken(token: string | null): void {
  memorySessionToken = token;
  try {
    if (token) {
      window.sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
    } else {
      window.sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors in restricted iframes
  }
}

let unauthorizedHandler: (() => void) | null = null;
export function registerAdminUnauthorizedHandler(fn: () => void) {
  unauthorizedHandler = fn;
}

async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredAdminSessionToken();
  const firebaseToken = await getFirebaseIdToken().catch(() => null);
  const res = await fetch(`/api/admin${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Admin-Session': token } : {}),
      ...(firebaseToken ? { 'X-Firebase-Id-Token': firebaseToken } : {}),
      ...((options.headers as Record<string, string>) || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (
      res.status === 401 &&
      data?.code === 'ADMIN_UNAUTHORIZED' &&
      path !== '/login' &&
      path !== '/auth/status'
    ) {
      setStoredAdminSessionToken(null);
      if (unauthorizedHandler) {
        unauthorizedHandler();
      }
    }
    throw new AdminApiError(data.error || `Request failed (${res.status})`, res.status, data.code);
  }
  return data as T;
}

export const adminApi = {
  getAuthStatus: () => adminFetch<AdminAuthStatus>('/auth/status'),
  login: async (email: string, password: string) => {
    const res = await adminFetch<{
      success: boolean;
      admin: AdminAccountPublic;
      sessionToken?: string;
      adminSdkConfigured?: boolean;
      firestoreMode?: string;
      firestoreConnected?: boolean;
      lastFirestoreError?: string | null;
    }>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.sessionToken) {
      setStoredAdminSessionToken(res.sessionToken);
    }
    return res;
  },
  logout: async () => {
    try {
      return await adminFetch<{ success: boolean }>('/logout', { method: 'POST' });
    } finally {
      setStoredAdminSessionToken(null);
    }
  },
  changePassword: (currentPassword: string, newPassword: string, confirmNewPassword?: string) =>
    adminFetch<{ success: boolean; admin: AdminAccountPublic; message: string }>('/change-password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword,
        newPassword,
        ...(confirmNewPassword !== undefined ? { confirmNewPassword } : {}),
      }),
    }),
  requestPasswordReset: (email: string) =>
    adminFetch<{ success: boolean; message: string }>('/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  confirmPasswordReset: (email: string, verificationSecret: string, newPassword: string) =>
    adminFetch<{ success: boolean; message: string }>('/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({ email, verificationSecret, newPassword }),
    }),

  getOverview: (days = 14) => adminFetch<AdminOverviewData & { success: boolean }>(`/overview?days=${days}`),

  // Users
  getUsers: (params?: { q?: string; status?: string; plan?: string; google?: string }) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set('q', params.q);
    if (params?.status) sp.set('status', params.status);
    if (params?.plan) sp.set('plan', params.plan);
    if (params?.google) sp.set('google', params.google);
    const qs = sp.toString();
    return adminFetch<{ success: boolean; users: AdminUserRecord[]; total: number }>(
      `/users${qs ? `?${qs}` : ''}`
    );
  },
  getUserDetail: (uid: string) =>
    adminFetch<{
      success: boolean;
      user: AdminUserRecord;
      projects: AdminProjectRecord[];
      paymentHistory: AdminPaymentRecord[];
      creditTransactions: AdminCreditTransaction[];
      speechHistory: AdminSpeechRecord[];
    }>(`/users/${encodeURIComponent(uid)}`),
  updateUser: (uid: string, payload: Partial<AdminUserRecord>) =>
    adminFetch<{ success: boolean; user: AdminUserRecord }>(`/users/${encodeURIComponent(uid)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  suspendUser: (uid: string, reason: string) =>
    adminFetch<{ success: boolean; user: AdminUserRecord }>(
      `/users/${encodeURIComponent(uid)}/suspend`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    ),
  reactivateUser: (uid: string) =>
    adminFetch<{ success: boolean; user: AdminUserRecord }>(
      `/users/${encodeURIComponent(uid)}/reactivate`,
      { method: 'POST' }
    ),
  deleteUser: (uid: string) =>
    adminFetch<{ success: boolean }>(`/users/${encodeURIComponent(uid)}`, { method: 'DELETE' }),

  // Credits
  getCreditTransactions: (params?: { q?: string; type?: string; dateFrom?: string; dateTo?: string }) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set('q', params.q);
    if (params?.type) sp.set('type', params.type);
    if (params?.dateFrom) sp.set('dateFrom', params.dateFrom);
    if (params?.dateTo) sp.set('dateTo', params.dateTo);
    const qs = sp.toString();
    return adminFetch<{
      success: boolean;
      transactions: AdminCreditTransaction[];
      summary: {
        totalPurchased: number;
        totalConsumed: number;
        totalRemaining: number;
        welcomeCreditsDistributed: number;
        welcomeBonusCount: number;
      };
    }>(`/credits/transactions${qs ? `?${qs}` : ''}`);
  },
  adjustCredits: (payload: {
    userId: string;
    mode: 'add' | 'deduct' | 'set';
    amount: number;
    reason: string;
    note?: string;
  }) =>
    adminFetch<{ success: boolean; user: AdminUserRecord; transaction: AdminCreditTransaction }>(
      '/credits/adjust',
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  // Payments
  getPayments: (params?: { q?: string; status?: string }) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set('q', params.q);
    if (params?.status) sp.set('status', params.status);
    const qs = sp.toString();
    return adminFetch<{ success: boolean; payments: AdminPaymentRecord[] }>(
      `/payments${qs ? `?${qs}` : ''}`
    );
  },
  getPaymentReceipt: (id: string) =>
    adminFetch<{ success: boolean; receipt: { dataUrl: string; mimeType: string } }>(
      `/payments/${encodeURIComponent(id)}/receipt`
    ),
  approvePayment: (id: string, adminNote?: string) =>
    adminFetch<{ success: boolean; payment: AdminPaymentRecord }>(
      `/payments/${encodeURIComponent(id)}/approve`,
      { method: 'POST', body: JSON.stringify({ adminNote }) }
    ),
  rejectPayment: (id: string, rejectionReason: string, adminNote?: string) =>
    adminFetch<{ success: boolean; payment: AdminPaymentRecord }>(
      `/payments/${encodeURIComponent(id)}/reject`,
      { method: 'POST', body: JSON.stringify({ rejectionReason, adminNote }) }
    ),
  updatePaymentNote: (id: string, adminNote: string) =>
    adminFetch<{ success: boolean; payment: AdminPaymentRecord }>(
      `/payments/${encodeURIComponent(id)}/note`,
      { method: 'PATCH', body: JSON.stringify({ adminNote }) }
    ),

  // Plans
  getPlans: () => adminFetch<{ success: boolean; plans: AdminPlanRecord[] }>('/plans'),
  createPlan: (payload: Partial<AdminPlanRecord>) =>
    adminFetch<{ success: boolean; plan: AdminPlanRecord }>('/plans', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updatePlan: (id: string, payload: Partial<AdminPlanRecord>) =>
    adminFetch<{ success: boolean; plan: AdminPlanRecord }>(`/plans/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deletePlan: (id: string) =>
    adminFetch<{ success: boolean }>(`/plans/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // API Integrations
  getIntegrations: () =>
    adminFetch<{ success: boolean; integrations: AdminIntegrationRecord[] }>('/integrations'),
  createIntegration: (payload: {
    providerName: string;
    providerType: 'openspeaker' | 'elevenlabs' | 'custom';
    endpointUrl: string;
    modelName: string;
    apiKey: string;
    isEnabled?: boolean;
    isPrimary?: boolean;
    rateLimitPerMin?: number;
  }) =>
    adminFetch<{ success: boolean; integration: AdminIntegrationRecord }>('/integrations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateIntegration: (
    id: string,
    payload: Partial<AdminIntegrationRecord> & { apiKey?: string }
  ) =>
    adminFetch<{ success: boolean; integration: AdminIntegrationRecord }>(
      `/integrations/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    ),
  deleteIntegration: (id: string) =>
    adminFetch<{ success: boolean }>(`/integrations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  testIntegration: (id: string) =>
    adminFetch<{ success: boolean; integration: AdminIntegrationRecord; error?: string }>(
      `/integrations/${encodeURIComponent(id)}/test`,
      { method: 'POST' }
    ),

  // Projects
  getProjects: (q?: string, status?: string) => {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (status) sp.set('status', status);
    const qs = sp.toString();
    return adminFetch<{ success: boolean; projects: AdminProjectRecord[] }>(
      `/projects${qs ? `?${qs}` : ''}`
    );
  },
  getProjectDetail: (id: string) =>
    adminFetch<{
      success: boolean;
      project: AdminProjectRecord;
      generations: AdminSpeechRecord[];
    }>(`/projects/${encodeURIComponent(id)}`),
  deleteProject: (id: string) =>
    adminFetch<{ success: boolean }>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Speech History
  getSpeechHistory: (q?: string, status?: string) => {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (status) sp.set('status', status);
    const qs = sp.toString();
    return adminFetch<{ success: boolean; history: AdminSpeechRecord[] }>(
      `/speech-history${qs ? `?${qs}` : ''}`
    );
  },
  deleteSpeechHistory: (id: string) =>
    adminFetch<{ success: boolean }>(`/speech-history/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Voices
  getVoices: (refresh = false) =>
    adminFetch<{
      success: boolean;
      voices: AdminVoiceRecord[];
      totalCount: number;
      disabledCount: number;
      customCount: number;
    }>(`/voices${refresh ? '?refresh=true' : ''}`),
  createVoice: (payload: {
    voiceId?: string;
    name: string;
    category?: string;
    language?: string;
    accent?: string;
    gender?: string;
    description?: string;
    previewUrl?: string;
    allowedPlans?: string[];
  }) => adminFetch<{ success: boolean }>('/voices', { method: 'POST', body: JSON.stringify(payload) }),
  updateVoice: (
    voiceId: string,
    payload: {
      enabled?: boolean;
      customName?: string;
      customCategory?: string;
      customLanguage?: string;
      customAccent?: string;
      customGender?: string;
      customDescription?: string;
      customPreviewUrl?: string;
      allowedPlans?: string[];
    }
  ) =>
    adminFetch<{ success: boolean }>(`/voices/${encodeURIComponent(voiceId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  // Settings
  getSettings: () => adminFetch<{ success: boolean; settings: AdminPlatformSettings }>('/settings'),
  updateSettings: (payload: Partial<AdminPlatformSettings>) =>
    adminFetch<{ success: boolean; settings: AdminPlatformSettings }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  // Audit Logs
  getAuditLogs: (params?: { q?: string; action?: string }) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set('q', params.q);
    if (params?.action) sp.set('action', params.action);
    const qs = sp.toString();
    return adminFetch<{ success: boolean; logs: AdminAuditLogRecord[]; total: number }>(
      `/audit-logs${qs ? `?${qs}` : ''}`
    );
  },

  // Admin Accounts & RBAC
  getAdminAccounts: () =>
    adminFetch<{
      success: boolean;
      accounts: AdminAccountPublic[];
      roleTemplates: Record<string, string[]>;
    }>('/accounts'),
  createAdminAccount: (payload: {
    email: string;
    name: string;
    role: string;
    permissions?: string[];
    initialPassword: string;
  }) =>
    adminFetch<{ success: boolean; account: AdminAccountPublic }>('/accounts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateAdminAccount: (
    id: string,
    payload: { name?: string; role?: string; permissions?: string[]; isActive?: boolean }
  ) =>
    adminFetch<{ success: boolean; account: AdminAccountPublic }>(
      `/accounts/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    ),
  resetAdminAccountPassword: (id: string, newPassword: string) =>
    adminFetch<{ success: boolean; message: string }>(
      `/accounts/${encodeURIComponent(id)}/reset-password`,
      { method: 'POST', body: JSON.stringify({ newPassword }) }
    ),
};
