import {
  Voice,
  CatalogInspection,
  ServerAppConfig,
  TaskStatusResponse,
  VoicePageResult,
  VoiceQueryOptions,
} from '../types/index.js';
import {
  buildVoiceQueryKey,
  getCachedVoicePage,
  getCachedVoicesByIds,
  getInflightSharedQuery,
  invalidateClientVoiceCache,
  setCachedVoicePage,
  setInflightSharedQuery,
  upsertCachedVoices,
} from './voiceCache.js';

export class ApiError extends Error {
  statusCode: number;
  retryAfter?: number;
  code?: string;

  constructor(message: string, statusCode: number = 500, retryAfter?: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
    this.code = code;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const retryAfterHeader = res.headers.get('Retry-After');
  const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

  let body: any = null;
  if (isJson) {
    try {
      body = await res.json();
    } catch {
      // json parse failed
    }
  } else {
    try {
      body = await res.text();
    } catch {
      // text parse failed
    }
  }

  if (!res.ok) {
    const errorMsg =
      (typeof body === 'object' && body?.error) ||
      (typeof body === 'object' && body?.message) ||
      (typeof body === 'string' && body.length < 200 ? body : null) ||
      `Request failed with status ${res.status}`;
    const code = typeof body === 'object' && typeof body?.code === 'string' ? body.code : undefined;

    throw new ApiError(errorMsg, res.status, retryAfter, code);
  }

  return body as T;
}

export async function fetchServerConfig(): Promise<ServerAppConfig> {
  const res = await fetch('/api/config');
  return handleResponse<ServerAppConfig>(res);
}

export async function checkServerHealth(): Promise<any> {
  const res = await fetch('/api/health');
  return handleResponse<any>(res);
}

export async function fetchVoicesPage(options: VoiceQueryOptions = {}): Promise<VoicePageResult> {
  const normalizedOpts: VoiceQueryOptions = {
    page: options.page ?? 1,
    limit: options.limit ?? 24,
    q: options.q?.trim() || undefined,
    category: options.category && options.category !== 'All' ? options.category : undefined,
    language: options.language && options.language !== 'all' ? options.language : undefined,
    accent: options.accent && options.accent !== 'all' ? options.accent : undefined,
    gender: options.gender && options.gender !== 'all' ? options.gender : undefined,
    sort: options.sort || 'default',
    ids: options.ids && options.ids.length > 0 ? options.ids : undefined,
    forceRefresh: options.forceRefresh,
  };

  if (normalizedOpts.forceRefresh) {
    invalidateClientVoiceCache();
  } else if (!options.bypassClientCache) {
    const cached = getCachedVoicePage(normalizedOpts);
    if (cached) return cached;
  }

  const key = buildVoiceQueryKey(normalizedOpts);
  // Deduplicate shared non-abortable requests (e.g. startup + modal prewarm)
  if (!options.signal && !normalizedOpts.forceRefresh && !options.bypassClientCache) {
    const inflight = getInflightSharedQuery(key);
    if (inflight) return inflight;
  }

  const params = new URLSearchParams();
  params.set('page', String(normalizedOpts.page));
  params.set('limit', String(normalizedOpts.limit));
  if (normalizedOpts.q) params.set('q', normalizedOpts.q);
  if (normalizedOpts.category) params.set('category', normalizedOpts.category);
  if (normalizedOpts.language) params.set('language', normalizedOpts.language);
  if (normalizedOpts.accent) params.set('accent', normalizedOpts.accent);
  if (normalizedOpts.gender) params.set('gender', normalizedOpts.gender);
  if (normalizedOpts.sort && normalizedOpts.sort !== 'default') params.set('sort', normalizedOpts.sort);
  if (normalizedOpts.ids && normalizedOpts.ids.length <= 40) {
    params.set('ids', normalizedOpts.ids.join(','));
  }
  if (normalizedOpts.forceRefresh) params.set('refresh', 'true');

  const execPromise = (async (): Promise<VoicePageResult> => {
    let res: Response;
    // Use POST /api/voices/batch when resolving very large explicit ID lists + filter, else slim GET
    if (normalizedOpts.ids && normalizedOpts.ids.length > 40 && !normalizedOpts.q) {
      res = await fetch(`/api/voices?${params.toString()}&ids=${encodeURIComponent(normalizedOpts.ids.slice(0, 120).join(','))}`, {
        signal: options.signal,
      });
    } else {
      res = await fetch(`/api/voices?${params.toString()}`, {
        signal: options.signal,
      });
    }
    const payload = await handleResponse<VoicePageResult & { success?: boolean }>(res);
    setCachedVoicePage(normalizedOpts, payload);
    return payload;
  })();

  if (!options.signal && !normalizedOpts.forceRefresh) {
    setInflightSharedQuery(key, execPromise);
  }

  return execPromise;
}

export async function fetchVoicesByIds(
  ids: string[],
  signal?: AbortSignal
): Promise<Voice[]> {
  const uniqueIds = Array.from(new Set(ids.map((s) => s.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const { found, missingIds } = getCachedVoicesByIds(uniqueIds);
  if (missingIds.length === 0) return found;

  const res = await fetch('/api/voices/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: missingIds }),
    signal,
  });
  const data = await handleResponse<{ success: boolean; voices: Voice[] }>(res);
  const resolved = data.voices || [];
  upsertCachedVoices(resolved);

  const byId = new Map<string, Voice>();
  for (const v of found) byId.set(v.id, v);
  for (const v of resolved) byId.set(v.id, v);

  return uniqueIds.map((id) => byId.get(id)).filter((v): v is Voice => Boolean(v));
}

export async function fetchVoices(forceRefresh: boolean = false): Promise<{
  voices: Voice[];
  inspection: CatalogInspection;
  degraded?: boolean;
  warning?: string;
}> {
  const url = forceRefresh ? '/api/voices?all=true&refresh=true' : '/api/voices?all=true';
  const res = await fetch(url);
  return handleResponse<{
    voices: Voice[];
    inspection: CatalogInspection;
    degraded?: boolean;
    warning?: string;
  }>(res);
}

export async function refreshVoiceCatalog(): Promise<{
  voices: Voice[];
  totalCatalog?: number;
  version?: string;
  inspection: CatalogInspection;
  degraded?: boolean;
  warning?: string;
  message: string;
}> {
  invalidateClientVoiceCache();
  const res = await fetch('/api/voices/refresh', {
    method: 'POST',
  });
  const data = await handleResponse<{
    voices: Voice[];
    totalCatalog?: number;
    version?: string;
    inspection: CatalogInspection;
    degraded?: boolean;
    warning?: string;
    message: string;
  }>(res);
  upsertCachedVoices(data.voices || []);
  return data;
}

export interface CreateTTSPayload {
  text: string;
  voiceId: string;
  voiceName?: string;
  projectId?: string;
  speed?: number;
  withTranscript?: boolean;
  fileName?: string;
}

const taskMetaTokenMap = new Map<string, string>();

function saveTaskMetaToken(taskId: string, token?: string) {
  if (!token) return;
  taskMetaTokenMap.set(taskId, token);
  try {
    window.sessionStorage.setItem(`speakly_task_meta_${taskId}`, token);
  } catch {
    // ignore storage errors
  }
}

function getTaskMetaToken(taskId: string): string | null {
  const mem = taskMetaTokenMap.get(taskId);
  if (mem) return mem;
  try {
    return window.sessionStorage.getItem(`speakly_task_meta_${taskId}`);
  } catch {
    return null;
  }
}

export async function createTTSSpeech(payload: CreateTTSPayload): Promise<{
  success: boolean;
  taskId: string;
  voiceId: string;
  characterCount: number;
  wordCount: number;
  fileName?: string;
  taskMetaToken?: string;
}> {
  const { getFirebaseIdToken } = await import('../firebase.js');
  const token = await getFirebaseIdToken().catch(() => null);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch('/api/tts', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await handleResponse<{
    success: boolean;
    taskId: string;
    voiceId: string;
    characterCount: number;
    wordCount: number;
    fileName?: string;
    taskMetaToken?: string;
  }>(res);
  saveTaskMetaToken(data.taskId, data.taskMetaToken);
  return data;
}

export async function fetchTaskStatus(
  taskId: string
): Promise<TaskStatusResponse & { updatedRemainingCredits?: number }> {
  const { getFirebaseIdToken } = await import('../firebase.js');
  const token = await getFirebaseIdToken().catch(() => null);
  const metaToken = getTaskMetaToken(taskId);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (metaToken) headers['X-Task-Meta'] = metaToken;

  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { headers });
  const data = await handleResponse<{
    success: boolean;
    task: TaskStatusResponse;
    updatedRemainingCredits?: number;
  }>(res);
  return {
    ...data.task,
    updatedRemainingCredits: data.updatedRemainingCredits,
  };
}

export function getDownloadUrl(taskId: string, fileName?: string, audioUrl?: string | null): string {
  const searchParams = new URLSearchParams();
  if (fileName) searchParams.set('filename', fileName);
  if (audioUrl) searchParams.set('url', audioUrl);
  const q = searchParams.toString();
  return `/api/download/${encodeURIComponent(taskId)}${q ? `?${q}` : ''}`;
}

export function getTranscriptDownloadUrl(taskId: string): string {
  return `/api/tasks/${encodeURIComponent(taskId)}/transcript`;
}

export function getVoicePreviewUrl(voice: Voice): string | null {
  if (!voice.previewUrl) return null;
  return `/api/voices/${encodeURIComponent(voice.id)}/preview?url=${encodeURIComponent(voice.previewUrl)}`;
}

export async function searchVoices(query: string): Promise<Voice[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  try {
    const res = await fetch(`/api/voices/search?q=${encodeURIComponent(trimmed)}`);
    const data = await handleResponse<{ success: boolean; voices: Voice[] }>(res);
    return data.voices || [];
  } catch (err) {
    console.warn('Voice search failed:', err);
    return [];
  }
}
