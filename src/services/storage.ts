import {
  GenerationHistoryItem,
  ActiveGenerationTask,
  Project,
  CreditLedgerState,
  UserProfile,
  UserPreferences,
  AppNotification,
} from '../types/index.js';

const FAVORITES_KEY = 'speaklystudio_favorites_v1';
const OLD_FAVORITES_KEY = 'voicestudio_favorites_v1';
const HISTORY_KEY = 'speaklystudio_history_v1';
const OLD_HISTORY_KEY = 'voicestudio_history_v1';
const ACTIVE_TASK_KEY = 'speaklystudio_active_task_v1';
const OLD_ACTIVE_TASK_KEY = 'voicestudio_active_task_v1';
const RECENT_VOICES_KEY = 'speaklystudio_recents_v1';
const OLD_RECENT_VOICES_KEY = 'voicestudio_recents_v1';
const PROJECTS_KEY = 'speaklystudio_projects_v1';
const CREDITS_KEY = 'speaklystudio_credits_v1';
const PROFILE_KEY = 'speaklystudio_profile_v1';
const PREFS_KEY = 'speaklystudio_prefs_v1';
const NOTIFICATIONS_KEY = 'speaklystudio_notifications_v1';
const THEME_KEY = 'speakly_studio_theme';

// Favorites Storage
export function getSavedFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY) || localStorage.getItem(OLD_FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === 'string');
    }
  } catch (e) {
    console.error('Failed to parse favorites from localStorage', e);
  }
  return [];
}

export function saveFavorites(favorites: string[]): void {
  try {
    const unique = Array.from(new Set(favorites));
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(unique));
  } catch (e) {
    console.error('Failed to save favorites to localStorage', e);
  }
}

export function toggleFavoriteVoice(voiceId: string): boolean {
  const current = getSavedFavorites();
  const exists = current.includes(voiceId);
  const updated = exists ? current.filter(id => id !== voiceId) : [...current, voiceId];
  saveFavorites(updated);
  return !exists;
}

// History Storage
export function getGenerationHistory(): GenerationHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY) || localStorage.getItem(OLD_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {
    console.error('Failed to load history from localStorage', e);
  }
  return [];
}

export function saveGenerationItem(item: GenerationHistoryItem): void {
  try {
    const current = getGenerationHistory();
    const filtered = current.filter(i => i.taskId !== item.taskId);
    const updated = [item, ...filtered].slice(0, 100);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save history item to localStorage', e);
  }
}

export function removeHistoryItem(id: string): void {
  try {
    const current = getGenerationHistory();
    const updated = current.filter(item => item.id !== id && item.taskId !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to remove history item', e);
  }
}

export function clearGenerationHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch (e) {
    console.error('Failed to clear generation history', e);
  }
}

// Active Task Storage
export function getActiveTask(): ActiveGenerationTask | null {
  try {
    const raw = localStorage.getItem(ACTIVE_TASK_KEY) || localStorage.getItem(OLD_ACTIVE_TASK_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read active task', e);
  }
  return null;
}

export function saveActiveTask(task: ActiveGenerationTask): void {
  try {
    localStorage.setItem(ACTIVE_TASK_KEY, JSON.stringify(task));
  } catch (e) {
    console.error('Failed to save active task', e);
  }
}

export function clearActiveTask(): void {
  try {
    localStorage.removeItem(ACTIVE_TASK_KEY);
    localStorage.removeItem(OLD_ACTIVE_TASK_KEY);
  } catch (e) {
    console.error('Failed to clear active task', e);
  }
}

// Recently used voice IDs
export function getRecentVoiceIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_VOICES_KEY) || localStorage.getItem(OLD_RECENT_VOICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    console.error('Failed to read recent voice IDs', e);
  }
  return [];
}

export function addRecentVoiceId(voiceId: string): void {
  try {
    const current = getRecentVoiceIds();
    const filtered = current.filter(id => id !== voiceId);
    const updated = [voiceId, ...filtered].slice(0, 8);
    localStorage.setItem(RECENT_VOICES_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save recent voice ID', e);
  }
}

// Legacy Access Code Migration Cleanup
export function clearLegacyAccessCodeStorage(): void {
  try {
    localStorage.removeItem('speaklystudio_access_code_v1');
    localStorage.removeItem('voicestudio_access_code_v1');
  } catch {
    // ignore storage access issues
  }
}

// Projects Storage
const DEFAULT_PROJECTS: Project[] = [
  {
    id: 'proj_launch_1',
    name: 'Product Launch Narration',
    description: 'Executive keynote voiceover script for Speakly Studio Q4 showcase.',
    script:
      'Welcome to Speakly Studio. In a world of fleeting moments, the voice is how we connect, inspire, and endure. Every story deserves to be heard with nuance, authentic emotion, and effortless clarity.',
    speed: 1.0,
    withTranscript: false,
    fileName: 'product_launch_keynote',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: 'proj_podcast_2',
    name: 'Deep Tech Podcast Intro',
    description: 'Weekly episode opening bumper and sponsor transition script.',
    script:
      'Hello listeners, and welcome back to Modern Systems Weekly. Today we break down ultra-low-latency neural voice synthesis and how creators are building studio-grade audio pipelines.',
    speed: 1.05,
    withTranscript: false,
    fileName: 'podcast_ep14_intro',
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
];

export function getSavedProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY) || localStorage.getItem('speakly_studio_projects');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Failed to read projects', e);
  }
  return DEFAULT_PROJECTS;
}

export function saveProjects(projects: Project[]): void {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error('Failed to save projects', e);
  }
}

// Credit Ledger Storage
export const GUEST_DEFAULT_CREDITS: CreditLedgerState = {
  planName: 'Guest',
  monthlyAllowance: 0,
  remainingCredits: 0,
  events: [],
};

export function getCreditLedger(): CreditLedgerState {
  try {
    const raw = localStorage.getItem(CREDITS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.remainingCredits === 'number') return parsed;
    }
  } catch (e) {
    console.error('Failed to read credit ledger', e);
  }
  return GUEST_DEFAULT_CREDITS;
}

export function saveCreditLedger(ledger: CreditLedgerState): void {
  try {
    localStorage.setItem(CREDITS_KEY, JSON.stringify(ledger));
  } catch (e) {
    console.error('Failed to save credit ledger', e);
  }
}

// User Profile & Preferences
export const GUEST_DEFAULT_PROFILE: UserProfile = {
  displayName: 'Guest Visitor',
  email: 'Sign in with Google to sync',
  role: 'Visitor Mode',
};

const DEFAULT_PREFS: UserPreferences = {
  theme: 'light',
  defaultLanguage: 'English',
  defaultSpeed: 1.0,
  defaultWithTranscript: false,
  defaultFormat: 'mp3',
  notifyOnComplete: true,
  notifyAccountAlerts: true,
};

export function getUserProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return { ...GUEST_DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return GUEST_DEFAULT_PROFILE;
}

export function saveUserProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.error('Failed to save profile', e);
  }
}

export function getUserPreferences(): UserPreferences {
  try {
    const storedTheme = localStorage.getItem(THEME_KEY);
    const raw = localStorage.getItem(PREFS_KEY);
    const base = raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
    if (storedTheme === 'dark' || storedTheme === 'light') {
      base.theme = storedTheme;
    }
    return base;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveUserPreferences(prefs: UserPreferences): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    localStorage.setItem(THEME_KEY, prefs.theme);
  } catch (e) {
    console.error('Failed to save preferences', e);
  }
}

// Notifications
export const GUEST_DEFAULT_NOTIFICATIONS: AppNotification[] = [];

export function getNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return GUEST_DEFAULT_NOTIFICATIONS;
}

export function saveNotifications(items: AppNotification[]): void {
  try {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(items.slice(0, 30)));
  } catch (e) {
    console.error('Failed to save notifications', e);
  }
}

// Full Workspace JSON Export / Import
export interface WorkspaceBackup {
  version: number;
  exportedAt: string;
  favorites: string[];
  history: GenerationHistoryItem[];
  projects: Project[];
  credits: CreditLedgerState;
  profile: UserProfile;
  preferences: UserPreferences;
}

export function exportWorkspaceBackup(): WorkspaceBackup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites: getSavedFavorites(),
    history: getGenerationHistory(),
    projects: getSavedProjects(),
    credits: getCreditLedger(),
    profile: getUserProfile(),
    preferences: getUserPreferences(),
  };
}

export function importWorkspaceBackup(data: Partial<WorkspaceBackup>): void {
  if (Array.isArray(data.favorites)) saveFavorites(data.favorites);
  if (Array.isArray(data.history)) localStorage.setItem(HISTORY_KEY, JSON.stringify(data.history.slice(0, 100)));
  if (Array.isArray(data.projects)) saveProjects(data.projects);
  if (data.credits && typeof data.credits.remainingCredits === 'number') saveCreditLedger(data.credits);
  if (data.profile && data.profile.displayName) saveUserProfile(data.profile);
  if (data.preferences && data.preferences.theme) saveUserPreferences(data.preferences);
}

const WELCOME_OFFER_DISMISSED_KEY = 'speaklystudio_welcome_offer_dismissed_v1';

export function getWelcomeOfferDismissed(): boolean {
  try {
    return localStorage.getItem(WELCOME_OFFER_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function dismissWelcomeOffer(): void {
  try {
    localStorage.setItem(WELCOME_OFFER_DISMISSED_KEY, 'true');
  } catch (e) {
    console.error('Failed to persist welcome offer dismissal', e);
  }
}

export function resetLocalSession(): void {
  clearLegacyAccessCodeStorage();
  localStorage.removeItem(ACTIVE_TASK_KEY);
}
