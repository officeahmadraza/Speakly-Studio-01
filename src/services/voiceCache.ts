import {
  Voice,
  CatalogInspection,
  VoiceFacets,
  VoicePageResult,
  VoiceQueryOptions,
} from '../types/index.js';

const MAX_CACHED_QUERIES = 80;

let activeVersion: string | null = null;
let cachedTotalCatalog = 0;
let cachedHydrating = false;
let cachedFacets: VoiceFacets | null = null;
let cachedInspection: CatalogInspection | null = null;

const queryCache = new Map<string, VoicePageResult>();
const voiceById = new Map<string, Voice>();
const inflightSharedQueries = new Map<string, Promise<VoicePageResult>>();

export function buildVoiceQueryKey(opts: VoiceQueryOptions): string {
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 24;
  const q = (opts.q || '').trim().toLowerCase();
  const category = (opts.category || 'All').trim().toLowerCase();
  const language = (opts.language || 'all').trim().toLowerCase();
  const accent = (opts.accent || 'all').trim().toLowerCase();
  const gender = (opts.gender || 'all').trim().toLowerCase();
  const sort = opts.sort || 'default';
  const ids =
    Array.isArray(opts.ids) && opts.ids.length > 0
      ? [...opts.ids].sort().join(',')
      : '';

  return [page, limit, q, category, language, accent, gender, sort, ids].join('|');
}

export function invalidateClientVoiceCache(): void {
  activeVersion = null;
  queryCache.clear();
  inflightSharedQueries.clear();
}

export function upsertCachedVoices(voices: Voice[]): void {
  for (const v of voices) {
    if (v?.id) {
      voiceById.set(v.id, v);
    }
  }
}

export function getCachedVoicePage(opts: VoiceQueryOptions): VoicePageResult | null {
  if (opts.forceRefresh) return null;
  const key = buildVoiceQueryKey(opts);
  const hit = queryCache.get(key);
  if (!hit) return null;
  // Refresh LRU order
  queryCache.delete(key);
  queryCache.set(key, hit);
  return hit;
}

export function setCachedVoicePage(opts: VoiceQueryOptions, data: VoicePageResult): void {
  if (data.version && activeVersion && data.version !== activeVersion) {
    queryCache.clear();
  }
  if (data.version) activeVersion = data.version;
  cachedTotalCatalog = data.totalCatalog;
  cachedHydrating = data.hydrating;
  cachedFacets = data.facets;
  cachedInspection = data.inspection;

  upsertCachedVoices(data.items);

  const key = buildVoiceQueryKey(opts);
  if (queryCache.size >= MAX_CACHED_QUERIES) {
    const oldestKey = queryCache.keys().next().value;
    if (oldestKey !== undefined) queryCache.delete(oldestKey);
  }
  queryCache.set(key, data);
}

export function getVoiceCacheMeta(): {
  version: string | null;
  totalCatalog: number;
  hydrating: boolean;
  facets: VoiceFacets | null;
  inspection: CatalogInspection | null;
} {
  return {
    version: activeVersion,
    totalCatalog: cachedTotalCatalog,
    hydrating: cachedHydrating,
    facets: cachedFacets,
    inspection: cachedInspection,
  };
}

export function getCachedVoicesByIds(ids: string[]): {
  found: Voice[];
  missingIds: string[];
} {
  const found: Voice[] = [];
  const missingIds: string[] = [];
  const seen = new Set<string>();

  for (const rawId of ids) {
    const id = String(rawId || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const hit = voiceById.get(id);
    if (hit) {
      found.push(hit);
    } else {
      missingIds.push(id);
    }
  }

  return { found, missingIds };
}

export function getInflightSharedQuery(key: string): Promise<VoicePageResult> | undefined {
  return inflightSharedQueries.get(key);
}

export function setInflightSharedQuery(key: string, promise: Promise<VoicePageResult>): void {
  inflightSharedQueries.set(key, promise);
  promise.finally(() => {
    if (inflightSharedQueries.get(key) === promise) {
      inflightSharedQueries.delete(key);
    }
  });
}
