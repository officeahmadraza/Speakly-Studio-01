import type { TranscriptWord, WordAlignedTranscript } from '../../shared/creditPricing.js';
export type { TranscriptWord, WordAlignedTranscript };

export type NavTab = 'create' | 'library' | 'favorites' | 'history' | 'projects' | 'settings';

export interface Voice {
  id: string; // e.g. elevenlabs_21m00Tcm4TlvDq8ikWAM
  name: string;
  category?: string;
  description?: string;
  previewUrl?: string | null;
  gender?: string;
  age?: string;
  accent?: string;
  language?: string;
  useCase?: string;
  tags: string[];
  isPremium?: boolean;
  raw?: Record<string, any>;
}

export interface CatalogInspection {
  totalVoices: number;
  sampleRecordKeys: string[];
  sampleRecordPreviewFields: string[];
  hasPreviewUrls: boolean;
  discoveredGenders: string[];
  discoveredLanguages: string[];
  discoveredAccents: string[];
  discoveredCategories: string[];
  discoveredUseCases: string[];
  discoveredTags: string[];
  fetchedAt: string;
  pageCount: number;
}

export type VoiceQuerySort = 'default' | 'name-asc' | 'name-desc' | 'category-asc';

export interface VoiceFacets {
  genders: string[];
  languages: string[];
  accents: string[];
  categories: string[];
}

export interface VoiceQueryOptions {
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
  language?: string;
  accent?: string;
  gender?: string;
  sort?: VoiceQuerySort;
  ids?: string[];
  forceRefresh?: boolean;
  bypassClientCache?: boolean;
  signal?: AbortSignal;
}

export interface VoicePageResult {
  items: Voice[];
  totalMatches: number;
  totalCatalog: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
  hydrating: boolean;
  version: string;
  facets: VoiceFacets;
  inspection: CatalogInspection;
  degraded?: boolean;
  warning?: string;
}

export interface ServerAppConfig {
  isConfigured: boolean;
  apiBaseUrl: string;
  maxTextChars: number;
  creditCostPer1kChars?: number;
  transcriptSurchargePercent?: number;
}

export interface GenerationHistoryItem {
  id: string;
  taskId: string;
  voiceId: string;
  voiceName: string;
  projectId?: string;
  projectName?: string;
  text: string;
  charCount: number;
  wordCount: number;
  speed?: number;
  withTranscript?: boolean;
  hasTranscript?: boolean;
  transcriptData?: WordAlignedTranscript | null;
  fileName?: string;
  audioUrl?: string | null;
  creditCost?: number | null;
  audioCredits?: number | null;
  transcriptCredits?: number | null;
  estimatedDurationSec?: number;
  status?: 'completed' | 'simulated' | 'failed';
  createdAt: string;
}

export interface ActiveGenerationTask {
  taskId: string;
  voiceId: string;
  voiceName: string;
  projectId?: string;
  text: string;
  speed: number;
  withTranscript: boolean;
  fileName: string;
  startedAt: number;
}

export interface TaskStatusResponse {
  taskId: string;
  status: 'pending' | 'processing' | 'generating' | 'done' | 'completed' | 'failed' | 'error';
  progress?: number;
  errorMessage?: string | null;
  creditCost?: number | null;
  audioCredits?: number | null;
  transcriptCredits?: number | null;
  audioUrl?: string | null;
  transcriptData?: WordAlignedTranscript | null;
  createdAt?: string;
  metadata?: Record<string, any>;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  script: string;
  voiceId?: string;
  voiceName?: string;
  speed?: number;
  withTranscript?: boolean;
  fileName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditUsageEvent {
  id: string;
  label: string;
  amount: number; // negative for deductions, positive for top-ups/resets
  voiceName?: string;
  createdAt: string;
}

export interface CreditLedgerState {
  planName: string;
  monthlyAllowance: number;
  remainingCredits: number;
  events: CreditUsageEvent[];
}

export interface UserProfile {
  displayName: string;
  email: string;
  role: string;
  avatarUrl?: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark';
  defaultLanguage: string;
  defaultSpeed: number;
  defaultWithTranscript: boolean;
  defaultFormat: 'mp3' | 'wav';
  notifyOnComplete: boolean;
  notifyAccountAlerts: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  read: boolean;
  createdAt: string;
}
