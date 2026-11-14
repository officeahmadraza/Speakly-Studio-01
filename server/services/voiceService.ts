import { openspeakerRequest } from './openspeakerClient.js';
import { registerObservedAudioHost } from '../config.js';
import type { VoiceOverrideRecord as VoiceOverride } from '../types/admin.js';

export interface SlimVoice {
  id: string; // The voice id to pass to TTS (e.g. elevenlabs_...)
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
}

export interface NormalizedVoice extends SlimVoice {
  raw?: Record<string, any>;
}

export interface ManagedVoice extends NormalizedVoice {
  enabled: boolean;
  allowedPlans: string[];
  isCustomAdded: boolean;
}

export interface VoiceCatalogInspection {
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

export interface VoiceCatalogCache {
  voices: NormalizedVoice[];
  inspection: VoiceCatalogInspection;
  cachedAt: number;
  expiresAt: number;
  hydrating: boolean;
  version: string;
  degraded?: boolean;
  warning?: string;
}

export interface VoiceQueryParams {
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
  language?: string;
  accent?: string;
  gender?: string;
  sort?: 'default' | 'name-asc' | 'name-desc' | 'category-asc';
  ids?: string[];
}

export interface VoicePageResponse {
  items: SlimVoice[];
  totalMatches: number;
  totalCatalog: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
  hydrating: boolean;
  version: string;
  facets: {
    genders: string[];
    languages: string[];
    accents: string[];
    categories: string[];
  };
  inspection: VoiceCatalogInspection;
  cachedAt: number;
  expiresAt: number;
  degraded?: boolean;
  warning?: string;
}

interface IndexedManagedVoice {
  slim: SlimVoice;
  nameLower: string;
  idLower: string;
  strippedIdLower: string;
  langLower: string;
  accentLower: string;
  genderLower: string;
  catLower: string;
  categoryHay: string;
  searchHay: string;
  orderIndex: number;
}

interface MergedCatalogIndex {
  key: string;
  version: string;
  items: IndexedManagedVoice[];
  byId: Map<string, IndexedManagedVoice>;
  facets: {
    genders: string[];
    languages: string[];
    accents: string[];
    categories: string[];
  };
  inspection: VoiceCatalogInspection;
  queryCache: Map<string, VoicePageResponse>;
}

let catalogCache: VoiceCatalogCache | null = null;
let isFetchingCatalog = false;
let pendingFetchPromise: Promise<VoiceCatalogCache> | null = null;
let backgroundHydrationPromise: Promise<void> | null = null;
let catalogVersionCounter = 1;
let mergedIndexCache: MergedCatalogIndex | null = null;

// Short-lived upstream search cache so rapid backspacing/tabbing avoids hammering upstream
const upstreamSearchCache = new Map<string, { voices: NormalizedVoice[]; expiresAt: number }>();
const UPSTREAM_SEARCH_TTL_MS = 60 * 1000;

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FALLBACK_CACHE_TTL_MS = 60 * 1000; // 1 minute for fallback responses
const UPSTREAM_PAGE_SIZE = 100;
const MAX_UPSTREAM_PAGES = 30;
const CONCURRENT_PAGE_BATCH = 6;
const MAX_QUERY_CACHE_ENTRIES = 80;

export const ESSENTIAL_PREMADE_VOICES: NormalizedVoice[] = [
  {
    id: 'elevenlabs_QMJTqaMXmGnG8TCm8WQG',
    name: 'Clyde - Vintage and Warm Radio Announcer',
    category: 'high_quality',
    description:
      'A vintage male announcer - think old timey radio! Best used for vintage radio broadcasts, character voices, and classic narration.',
    previewUrl:
      'https://storage.googleapis.com/eleven-public-prod/database/user/H2fHN4TKljQ16bAflYGeOPXd0qB2/voices/QMJTqaMXmGnG8TCm8WQG/aa1008ab-76bf-4aa2-96f4-a0f4256722ca.mp3',
    gender: 'male',
    age: 'middle_aged',
    accent: 'american',
    language: 'en',
    useCase: 'vintage_radio_narration',
    tags: ['vintage', 'radio', 'announcer', 'classic', 'en-US', 'male', 'character'],
  },
];

function nextCatalogVersion(): string {
  catalogVersionCounter += 1;
  return `v${catalogVersionCounter}-${Date.now().toString(36)}`;
}

export function getCatalogVersion(): string {
  return catalogCache?.version || `v${catalogVersionCounter}`;
}

/**
 * Strip heavy raw payload blobs before sending over HTTP
 */
export function toSlimVoice(v: NormalizedVoice | SlimVoice): SlimVoice {
  return {
    id: v.id,
    name: v.name,
    ...(v.category ? { category: v.category } : {}),
    ...(v.description ? { description: v.description } : {}),
    previewUrl: v.previewUrl ?? null,
    ...(v.gender ? { gender: v.gender } : {}),
    ...(v.age ? { age: v.age } : {}),
    ...(v.accent ? { accent: v.accent } : {}),
    ...(v.language ? { language: v.language } : {}),
    ...(v.useCase ? { useCase: v.useCase } : {}),
    tags: Array.isArray(v.tags) ? v.tags : [],
  };
}

/**
 * Extract preview URL candidates from any nested or flat field
 */
function findPreviewUrl(record: Record<string, any>): string | null {
  const candidateKeys = [
    'preview_url',
    'previewUrl',
    'sample_url',
    'sampleUrl',
    'audio_sample_url',
    'audio_url',
    'sample',
    'preview',
    'audio_preview_url',
  ];

  for (const key of candidateKeys) {
    if (typeof record[key] === 'string' && record[key].trim().startsWith('http')) {
      return record[key].trim();
    }
  }

  if (record.samples && Array.isArray(record.samples) && record.samples.length > 0) {
    const firstSample = record.samples[0];
    if (typeof firstSample === 'string' && firstSample.startsWith('http')) {
      return firstSample;
    }
    if (typeof firstSample === 'object' && firstSample?.audio_url) {
      return firstSample.audio_url;
    }
    if (typeof firstSample === 'object' && firstSample?.preview_url) {
      return firstSample.preview_url;
    }
  }

  if (record.preview && typeof record.preview === 'object') {
    const url = record.preview.url || record.preview.audio_url;
    if (typeof url === 'string' && url.startsWith('http')) return url;
  }

  return null;
}

/**
 * Safely extract and normalize slim voice metadata (discards heavy raw upstream blob)
 */
function normalizeVoice(rawRecord: Record<string, any>): NormalizedVoice {
  const id = String(
    rawRecord.voice_id ||
      rawRecord.id ||
      rawRecord.voiceId ||
      rawRecord.uuid ||
      ''
  ).trim();

  const name = String(rawRecord.name || rawRecord.voice_name || id || 'Unnamed Voice').trim();
  const description = rawRecord.description || rawRecord.bio || rawRecord.desc || '';
  const category = rawRecord.category || rawRecord.type || '';

  const previewUrl = findPreviewUrl(rawRecord);
  if (previewUrl) {
    try {
      const parsedUrl = new URL(previewUrl);
      registerObservedAudioHost(parsedUrl.hostname);
    } catch {
      // ignore URL parse errors
    }
  }

  const labels: Record<string, any> = rawRecord.labels || rawRecord.metadata || {};

  const gender =
    rawRecord.gender ||
    labels.gender ||
    labels['voice-gender'] ||
    labels.Gender ||
    undefined;

  const age =
    rawRecord.age ||
    labels.age ||
    labels['voice-age'] ||
    labels.Age ||
    undefined;

  const accent =
    rawRecord.accent ||
    labels.accent ||
    labels['voice-accent'] ||
    labels.Accent ||
    undefined;

  const language =
    rawRecord.language ||
    labels.language ||
    labels['voice-language'] ||
    labels.Language ||
    rawRecord.lang ||
    undefined;

  const useCase =
    rawRecord.use_case ||
    rawRecord.useCase ||
    labels.use_case ||
    labels['use case'] ||
    labels.useCase ||
    labels.descriptive ||
    undefined;

  const tagsSet = new Set<string>();
  if (Array.isArray(rawRecord.tags)) {
    rawRecord.tags.forEach((t) => typeof t === 'string' && tagsSet.add(t.trim()));
  }
  if (Array.isArray(rawRecord.categories)) {
    rawRecord.categories.forEach((c) => typeof c === 'string' && tagsSet.add(c.trim()));
  }
  if (labels && typeof labels === 'object') {
    Object.values(labels).forEach((v) => {
      if (typeof v === 'string' && v.trim().length > 0 && v.trim().length < 30) {
        tagsSet.add(v.trim());
      }
    });
  }

  return {
    id,
    name,
    category: category ? String(category).trim() : undefined,
    description: description ? String(description).trim() : undefined,
    previewUrl,
    gender: gender ? String(gender).trim() : undefined,
    age: age ? String(age).trim() : undefined,
    accent: accent ? String(accent).trim() : undefined,
    language: language ? String(language).trim() : undefined,
    useCase: useCase ? String(useCase).trim() : undefined,
    tags: Array.from(tagsSet).filter((t) => t.length > 0),
  };
}

function buildCatalogSnapshot(
  allRawVoices: Record<string, any>[],
  sampleRecordKeys: string[],
  pageCount: number,
  now: number,
  ttlMs: number,
  hydrating: boolean,
  degraded = false,
  warning?: string,
  sampleRecordPreviewFieldsOverride?: string[]
): VoiceCatalogCache {
  const voiceMap = new Map<string, NormalizedVoice>();

  for (const essential of ESSENTIAL_PREMADE_VOICES) {
    voiceMap.set(essential.id, { ...essential, tags: [...essential.tags] });
  }

  for (const raw of allRawVoices) {
    const norm = normalizeVoice(raw);
    if (!norm.id) continue;

    const existing = voiceMap.get(norm.id);
    if (!existing) {
      voiceMap.set(norm.id, norm);
    } else {
      if (!existing.previewUrl && norm.previewUrl) {
        existing.previewUrl = norm.previewUrl;
      }
      if (!existing.description && norm.description) {
        existing.description = norm.description;
      }
      if (norm.tags && norm.tags.length > 0) {
        existing.tags = Array.from(new Set([...existing.tags, ...norm.tags]));
      }
    }
  }

  const normalizedVoices = Array.from(voiceMap.values());

  const sampleRecordPreviewFields: string[] = sampleRecordPreviewFieldsOverride
    ? [...sampleRecordPreviewFieldsOverride]
    : [];
  if (!sampleRecordPreviewFieldsOverride && allRawVoices.length > 0) {
    for (const k of Object.keys(allRawVoices[0])) {
      if (
        k.toLowerCase().includes('preview') ||
        k.toLowerCase().includes('sample') ||
        k.toLowerCase().includes('audio')
      ) {
        sampleRecordPreviewFields.push(k);
      }
    }
  }

  const genderSet = new Set<string>();
  const langSet = new Set<string>();
  const accentSet = new Set<string>();
  const categorySet = new Set<string>();
  const useCaseSet = new Set<string>();
  const allTags = new Set<string>();
  let previewCount = 0;

  for (const v of normalizedVoices) {
    if (v.gender) genderSet.add(v.gender);
    if (v.language) langSet.add(v.language);
    if (v.accent) accentSet.add(v.accent);
    if (v.category) categorySet.add(v.category);
    if (v.useCase) useCaseSet.add(v.useCase);
    if (v.previewUrl) previewCount += 1;
    for (const t of v.tags) allTags.add(t);
  }

  const inspection: VoiceCatalogInspection = {
    totalVoices: normalizedVoices.length,
    sampleRecordKeys,
    sampleRecordPreviewFields,
    hasPreviewUrls: previewCount > 0,
    discoveredGenders: Array.from(genderSet).sort(),
    discoveredLanguages: Array.from(langSet).sort(),
    discoveredAccents: Array.from(accentSet).sort(),
    discoveredCategories: Array.from(categorySet).sort(),
    discoveredUseCases: Array.from(useCaseSet).sort(),
    discoveredTags: Array.from(allTags).sort(),
    fetchedAt: new Date().toISOString(),
    pageCount,
  };

  return {
    voices: normalizedVoices,
    inspection,
    cachedAt: now,
    expiresAt: now + ttlMs,
    hydrating,
    version: nextCatalogVersion(),
    degraded,
    warning,
  };
}

async function fetchUpstreamPage(page: number): Promise<Record<string, any>[]> {
  const queryParams = new URLSearchParams({
    provider: 'elevenlabs',
    page: String(page),
    page_size: String(UPSTREAM_PAGE_SIZE),
  });

  const response = await openspeakerRequest<{
    success?: boolean;
    data?: any[];
    voices?: any[];
  }>({
    method: 'GET',
    path: `/v3/voices?${queryParams.toString()}`,
    timeoutMs: 25000,
  });

  return Array.isArray(response?.data)
    ? response.data
    : Array.isArray(response?.voices)
    ? response.voices
    : [];
}

/**
 * Concurrently fetches remaining pages (2..30) in bounded batches so the full
 * 3,022+ catalog warms up in ~3-5 seconds instead of 30+ seconds sequentially.
 */
async function hydrateRemainingPages(
  page1Raw: Record<string, any>[],
  sampleRecordKeys: string[],
  sampleRecordPreviewFields: string[],
  startedAt: number
): Promise<VoiceCatalogCache> {
  const collectedRaw: Record<string, any>[] = [...page1Raw];
  let pagesFetched = 1;
  let reachedEnd = page1Raw.length < UPSTREAM_PAGE_SIZE;
  let partialWarning: string | undefined;

  let nextPage = 2;
  while (!reachedEnd && nextPage <= MAX_UPSTREAM_PAGES) {
    const batchPages: number[] = [];
    for (let i = 0; i < CONCURRENT_PAGE_BATCH && nextPage <= MAX_UPSTREAM_PAGES; i++) {
      batchPages.push(nextPage++);
    }

    const batchResults = await Promise.allSettled(batchPages.map((p) => fetchUpstreamPage(p)));

    for (let i = 0; i < batchResults.length; i++) {
      const res = batchResults[i];
      if (res.status === 'fulfilled') {
        const rows = res.value;
        if (rows.length === 0) {
          reachedEnd = true;
        } else {
          collectedRaw.push(...rows);
          pagesFetched += 1;
          if (rows.length < UPSTREAM_PAGE_SIZE) {
            reachedEnd = true;
          }
        }
      } else {
        partialWarning = `Loaded ${collectedRaw.length} voices; upstream paused additional pages (${res.reason?.message || 'network timeout'}).`;
        reachedEnd = true;
        break;
      }
    }
  }

  const completed = buildCatalogSnapshot(
    collectedRaw,
    sampleRecordKeys,
    pagesFetched,
    Date.now(),
    CACHE_TTL_MS,
    false,
    Boolean(partialWarning),
    partialWarning,
    sampleRecordPreviewFields
  );

  // Merge any upstream-searched voices discovered during background hydration
  if (catalogCache && catalogCache.voices.length > 0) {
    const existingIds = new Set(completed.voices.map((v) => v.id));
    for (const v of catalogCache.voices) {
      if (v.id && !existingIds.has(v.id)) {
        completed.voices.push(v);
        existingIds.add(v.id);
      }
    }
    completed.inspection.totalVoices = completed.voices.length;
  }

  catalogCache = completed;
  mergedIndexCache = null;
  console.log(
    `[VoiceService] Concurrent hydration finished in ${Date.now() - startedAt}ms (${completed.voices.length} voices across ${pagesFetched} page(s)).`
  );
  return completed;
}

/**
 * Fetches voice catalog cleanly:
 * - waitForFull=false (default for fast UI startup/modal open): resolves immediately once Page 1 is ready,
 *   while concurrently hydrating remaining pages in the background.
 * - waitForFull=true (for manual refresh / admin full catalog): awaits concurrent full hydration.
 */
export async function fetchVoiceCatalog(
  forceRefresh: boolean = false,
  waitForFull: boolean = false
): Promise<VoiceCatalogCache> {
  const now = Date.now();
  const previousCache = catalogCache;

  if (!forceRefresh && catalogCache && catalogCache.expiresAt > now) {
    if (waitForFull && catalogCache.hydrating && backgroundHydrationPromise) {
      await backgroundHydrationPromise;
      return catalogCache!;
    }
    return catalogCache;
  }

  if (!forceRefresh && isFetchingCatalog && pendingFetchPromise) {
    const firstSnapshot = await pendingFetchPromise;
    if (waitForFull && firstSnapshot.hydrating && backgroundHydrationPromise) {
      await backgroundHydrationPromise;
      return catalogCache!;
    }
    return firstSnapshot;
  }

  isFetchingCatalog = true;
  pendingFetchPromise = (async () => {
    const startedAt = Date.now();
    try {
      console.log('[VoiceService] Fetching Page 1 from OpenSpeaker upstream...');
      const page1Data = await fetchUpstreamPage(1);
      const sampleRecordKeys = page1Data.length > 0 ? Object.keys(page1Data[0]) : [];
      const sampleRecordPreviewFields = sampleRecordKeys.filter(
        (k) =>
          k.toLowerCase().includes('preview') ||
          k.toLowerCase().includes('sample') ||
          k.toLowerCase().includes('audio')
      );

      const hasMoreUpstream = page1Data.length >= UPSTREAM_PAGE_SIZE;
      const initialSnapshot = buildCatalogSnapshot(
        page1Data,
        sampleRecordKeys,
        1,
        now,
        CACHE_TTL_MS,
        hasMoreUpstream,
        false,
        undefined,
        sampleRecordPreviewFields
      );

      catalogCache = initialSnapshot;
      mergedIndexCache = null;

      if (hasMoreUpstream) {
        const bgPromise = hydrateRemainingPages(
          page1Data,
          sampleRecordKeys,
          sampleRecordPreviewFields,
          startedAt
        )
          .then(() => undefined)
          .catch((bgErr) => {
            console.warn('[VoiceService] Background hydration warning:', bgErr?.message || bgErr);
            if (catalogCache) {
              catalogCache.hydrating = false;
            }
          })
          .finally(() => {
            if (backgroundHydrationPromise === bgPromise) {
              backgroundHydrationPromise = null;
            }
          });

        backgroundHydrationPromise = bgPromise;

        if (waitForFull) {
          await bgPromise;
          return catalogCache!;
        }
      }

      return initialSnapshot;
    } catch (err: any) {
      console.warn('[VoiceService] Upstream catalog fetch failed:', err.message);

      if (previousCache && previousCache.voices.length > 0) {
        console.warn('[VoiceService] Serving previously cached catalog while upstream recovers.');
        catalogCache = {
          ...previousCache,
          expiresAt: now + FALLBACK_CACHE_TTL_MS,
          hydrating: false,
          degraded: true,
          warning: err.message,
        };
        mergedIndexCache = null;
        return catalogCache;
      }

      console.warn('[VoiceService] Serving curated starter voice fallback while upstream is busy.');
      catalogCache = buildCatalogSnapshot(
        [],
        [],
        0,
        now,
        FALLBACK_CACHE_TTL_MS,
        false,
        true,
        err.message
      );
      mergedIndexCache = null;
      return catalogCache;
    } finally {
      isFetchingCatalog = false;
      pendingFetchPromise = null;
    }
  })();

  return pendingFetchPromise;
}

/**
 * Non-blocking server boot prewarm so voices are ready before first user click
 */
export function prewarmVoiceCatalog(): void {
  void fetchVoiceCatalog(false, true).catch((err) => {
    console.warn('[VoiceService] Prewarm skipped:', err?.message || err);
  });
}

export function getCachedVoiceById(voiceId: string): NormalizedVoice | undefined {
  const directEssential = ESSENTIAL_PREMADE_VOICES.find(
    (v) => v.id === voiceId || v.id === `elevenlabs_${voiceId}` || `elevenlabs_${v.id}` === voiceId
  );
  if (directEssential) return directEssential;

  if (!catalogCache) return undefined;
  return catalogCache.voices.find(
    (v) => v.id === voiceId || v.id === `elevenlabs_${voiceId}` || `elevenlabs_${v.id}` === voiceId
  );
}

export function invalidateVoiceCache(): void {
  catalogCache = null;
  mergedIndexCache = null;
  backgroundHydrationPromise = null;
  upstreamSearchCache.clear();
  catalogVersionCounter += 1;
}

/**
 * Direct search against OpenSpeaker's 22,000+ ElevenLabs voice library
 */
export async function searchUpstreamVoices(query: string): Promise<NormalizedVoice[]> {
  const sanitized = query.trim();
  if (!sanitized) return [];

  const cacheKey = sanitized.toLowerCase();
  const cached = upstreamSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.voices;
  }

  const rawIdQuery = sanitized.replace(/^elevenlabs_/, '');

  try {
    const response = await openspeakerRequest<{
      data?: any[];
      voices?: any[];
    }>({
      method: 'GET',
      path: `/v3/voices?provider=elevenlabs&search=${encodeURIComponent(sanitized)}`,
      timeoutMs: 12000,
    });

    const results = (response?.data || response?.voices || []).map(normalizeVoice);

    if (results.length === 0 && rawIdQuery !== sanitized) {
      const fallbackRes = await openspeakerRequest<{
        data?: any[];
        voices?: any[];
      }>({
        method: 'GET',
        path: `/v3/voices?provider=elevenlabs&search=${encodeURIComponent(rawIdQuery)}`,
        timeoutMs: 12000,
      });
      const fallbackResults = (fallbackRes?.data || fallbackRes?.voices || []).map(normalizeVoice);
      results.push(...fallbackResults);
    }

    upstreamSearchCache.set(cacheKey, {
      voices: results,
      expiresAt: Date.now() + UPSTREAM_SEARCH_TTL_MS,
    });

    if (catalogCache && results.length > 0) {
      const existingIds = new Set(catalogCache.voices.map((v) => v.id));
      let added = 0;
      for (const v of results) {
        if (v.id && !existingIds.has(v.id)) {
          catalogCache.voices.push(v);
          existingIds.add(v.id);
          added += 1;
        }
      }
      if (added > 0) {
        catalogCache.inspection.totalVoices = catalogCache.voices.length;
        catalogCache.version = nextCatalogVersion();
        mergedIndexCache = null;
      }
    }

    return results;
  } catch (err: any) {
    console.error('[VoiceService] Upstream voice search error:', err.message);
    return [];
  }
}

export function mergeVoicesWithOverrides(
  voices: NormalizedVoice[],
  overrides: Array<{
    voiceId: string;
    enabled: boolean;
    customName?: string;
    customCategory?: string;
    customLanguage?: string;
    customAccent?: string;
    customGender?: string;
    customDescription?: string;
    allowedPlans: string[];
    isCustomAdded: boolean;
    customPreviewUrl?: string;
  }>,
  includeDisabled: boolean = false
): ManagedVoice[] {
  const overrideMap = new Map(overrides.map((o) => [o.voiceId, o]));
  const result: ManagedVoice[] = [];

  for (const v of voices) {
    const ov = overrideMap.get(v.id);
    if (ov && !ov.enabled && !includeDisabled) {
      continue;
    }
    result.push({
      ...v,
      name: ov?.customName || v.name,
      category: ov?.customCategory || v.category,
      language: ov?.customLanguage || v.language,
      accent: ov?.customAccent || v.accent,
      gender: ov?.customGender || v.gender,
      description: ov?.customDescription || v.description,
      previewUrl: ov?.customPreviewUrl || v.previewUrl,
      enabled: ov ? ov.enabled : true,
      allowedPlans: ov?.allowedPlans || [],
      isCustomAdded: Boolean(ov?.isCustomAdded),
    });
    if (ov) overrideMap.delete(v.id);
  }

  for (const ov of overrideMap.values()) {
    if (!ov.isCustomAdded) continue;
    if (!ov.enabled && !includeDisabled) continue;
    result.unshift({
      id: ov.voiceId,
      name: ov.customName || ov.voiceId,
      category: ov.customCategory || 'custom',
      description: ov.customDescription || 'Custom studio voice actor',
      previewUrl: ov.customPreviewUrl || null,
      gender: ov.customGender,
      accent: ov.customAccent,
      language: ov.customLanguage || 'English',
      tags: ['custom'],
      enabled: ov.enabled,
      allowedPlans: ov.allowedPlans || [],
      isCustomAdded: true,
    });
  }

  return result;
}

function computeOverrideSignature(overrides: VoiceOverride[]): string {
  if (!overrides || overrides.length === 0) return '0';
  let latest = '';
  for (const o of overrides) {
    if (o.updatedAt > latest) latest = o.updatedAt;
  }
  return `${overrides.length}:${latest}`;
}

function getOrBuildMergedIndex(
  catalog: VoiceCatalogCache,
  overrides: VoiceOverride[]
): MergedCatalogIndex {
  const indexKey = `${catalog.version}::${computeOverrideSignature(overrides)}`;
  if (mergedIndexCache && mergedIndexCache.key === indexKey) {
    return mergedIndexCache;
  }

  const merged = mergeVoicesWithOverrides(catalog.voices, overrides, false);
  const items: IndexedManagedVoice[] = [];
  const byId = new Map<string, IndexedManagedVoice>();

  const genderSet = new Set<string>();
  const langSet = new Set<string>();
  const accentSet = new Set<string>();
  const categorySet = new Set<string>();

  for (let i = 0; i < merged.length; i++) {
    const slim = toSlimVoice(merged[i]);
    const nameLower = slim.name.toLowerCase();
    const idLower = slim.id.toLowerCase();
    const strippedIdLower = idLower.replace(/^elevenlabs_/, '');
    const langLower = (slim.language || '').toLowerCase();
    const accentLower = (slim.accent || '').toLowerCase();
    const genderLower = (slim.gender || '').toLowerCase();
    const catLower = (slim.category || '').toLowerCase();

    const categoryHay = [slim.category, slim.useCase, slim.description, ...(slim.tags || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const searchHay = [
      slim.name,
      slim.id,
      strippedIdLower,
      slim.category,
      slim.description,
      slim.gender,
      slim.age,
      slim.accent,
      slim.language,
      slim.useCase,
      ...(slim.tags || []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (slim.gender) genderSet.add(slim.gender);
    if (slim.language) langSet.add(slim.language);
    if (slim.accent) accentSet.add(slim.accent);
    if (slim.category) categorySet.add(slim.category);

    const indexed: IndexedManagedVoice = {
      slim,
      nameLower,
      idLower,
      strippedIdLower,
      langLower,
      accentLower,
      genderLower,
      catLower,
      categoryHay,
      searchHay,
      orderIndex: i,
    };
    items.push(indexed);
    byId.set(slim.id, indexed);
  }

  mergedIndexCache = {
    key: indexKey,
    version: `${catalog.version}-${computeOverrideSignature(overrides)}`,
    items,
    byId,
    facets: {
      genders: Array.from(genderSet).sort(),
      languages: Array.from(langSet).sort(),
      accents: Array.from(accentSet).sort(),
      categories: Array.from(categorySet).sort(),
    },
    inspection: {
      ...catalog.inspection,
      totalVoices: items.length,
    },
    queryCache: new Map(),
  };

  return mergedIndexCache;
}

function scoreIndexedVoice(item: IndexedManagedVoice, queryLower: string, tokens: string[]): number {
  if (!queryLower) return 1;

  const strippedQuery = queryLower.replace(/^elevenlabs_/, '');
  if (item.idLower === queryLower || item.strippedIdLower === strippedQuery) return 1000;
  if (item.nameLower === queryLower) return 900;
  if (item.nameLower.startsWith(queryLower)) return 750;
  if (item.idLower.startsWith(queryLower) || item.strippedIdLower.startsWith(strippedQuery)) return 700;

  if (
    item.nameLower.includes(` ${queryLower}`) ||
    item.nameLower.includes(`-${queryLower}`) ||
    item.nameLower.includes(`(${queryLower}`)
  ) {
    return 600;
  }

  if (item.nameLower.includes(queryLower)) return 500;
  if (item.idLower.includes(queryLower) || (strippedQuery && item.strippedIdLower.includes(strippedQuery))) {
    return 400;
  }
  if (item.searchHay.includes(queryLower)) return 150;

  if (tokens.length > 1) {
    let allMatch = true;
    for (const token of tokens) {
      if (!item.searchHay.includes(token)) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return 100;
  }

  return 0;
}

/**
 * Server-side paginated & indexed voice query supporting infinite scroll, search, facets, and sorting.
 */
export async function queryVoiceCatalog(
  params: VoiceQueryParams,
  overrides: VoiceOverride[],
  forceRefresh: boolean = false
): Promise<VoicePageResponse> {
  const catalog = await fetchVoiceCatalog(forceRefresh, false);
  let index = getOrBuildMergedIndex(catalog, overrides);

  const page = Math.max(1, Number.isFinite(params.page) ? Number(params.page) : 1);
  const limit = Math.min(100, Math.max(1, Number.isFinite(params.limit) ? Number(params.limit) : 24));
  const qRaw = (params.q || '').trim();
  const qLower = qRaw.toLowerCase();
  const category = (params.category || 'All').trim();
  const categoryLower = category.toLowerCase();
  const languageLower = (params.language || 'all').trim().toLowerCase();
  const accentLower = (params.accent || 'all').trim().toLowerCase();
  const genderLower = (params.gender || 'all').trim().toLowerCase();
  const sort = params.sort || 'default';
  const idsFilter =
    Array.isArray(params.ids) && params.ids.length > 0
      ? params.ids.map((s) => s.trim()).filter(Boolean)
      : null;

  const cacheKey = [
    page,
    limit,
    qLower,
    categoryLower,
    languageLower,
    accentLower,
    genderLower,
    sort,
    idsFilter ? idsFilter.join(',') : '',
  ].join('|');

  if (!forceRefresh) {
    const cachedPage = index.queryCache.get(cacheKey);
    if (cachedPage) {
      // Refresh LRU insertion order
      index.queryCache.delete(cacheKey);
      index.queryCache.set(cacheKey, cachedPage);
      return cachedPage;
    }
  }

  const filterMatches = (source: IndexedManagedVoice[]) => {
    const idSet = idsFilter ? new Set(idsFilter) : null;
    const matched: IndexedManagedVoice[] = [];

    for (const item of source) {
      if (idSet && !idSet.has(item.slim.id)) continue;
      if (genderLower && genderLower !== 'all' && item.genderLower !== genderLower) continue;
      if (languageLower && languageLower !== 'all' && item.langLower !== languageLower) continue;
      if (accentLower && accentLower !== 'all' && item.accentLower !== accentLower) continue;
      if (category && categoryLower !== 'all' && !item.categoryHay.includes(categoryLower)) continue;
      matched.push(item);
    }

    return matched;
  };

  let candidates = filterMatches(index.items);

  const runSearchAndSort = (list: IndexedManagedVoice[]) => {
    if (qLower) {
      const tokens = qLower.split(/\s+/).filter(Boolean);
      const scored: { item: IndexedManagedVoice; score: number }[] = [];
      for (const item of list) {
        const s = scoreIndexedVoice(item, qLower, tokens);
        if (s > 0) scored.push({ item, score: s });
      }
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (sort === 'name-desc') return b.item.slim.name.localeCompare(a.item.slim.name);
        if (sort === 'category-asc') {
          return (a.item.slim.category || '').localeCompare(b.item.slim.category || '');
        }
        return a.item.slim.name.localeCompare(b.item.slim.name);
      });
      return scored.map((s) => s.item);
    }

    if (sort === 'name-asc') {
      return [...list].sort((a, b) => a.slim.name.localeCompare(b.slim.name));
    }
    if (sort === 'name-desc') {
      return [...list].sort((a, b) => b.slim.name.localeCompare(a.slim.name));
    }
    if (sort === 'category-asc') {
      return [...list].sort((a, b) => (a.slim.category || '').localeCompare(b.slim.category || ''));
    }
    return list;
  };

  let ordered = runSearchAndSort(candidates);

  // If user searches >=2 characters on page 1 and local catalog yields very few hits, check upstream 22k library
  if (qRaw.length >= 2 && ordered.length < 4 && !idsFilter) {
    const upstreamHits = await searchUpstreamVoices(qRaw);
    if (upstreamHits.length > 0 && catalogCache) {
      index = getOrBuildMergedIndex(catalogCache, overrides);
      candidates = filterMatches(index.items);
      ordered = runSearchAndSort(candidates);
    }
  }

  const totalMatches = ordered.length;
  const totalPages = Math.max(1, Math.ceil(totalMatches / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  const items = ordered.slice(start, start + limit).map((i) => i.slim);

  const response: VoicePageResponse = {
    items,
    totalMatches,
    totalCatalog: index.items.length,
    page: safePage,
    limit,
    totalPages,
    hasMore: safePage < totalPages,
    hydrating: catalog.hydrating,
    version: index.version,
    facets: index.facets,
    inspection: index.inspection,
    cachedAt: catalog.cachedAt,
    expiresAt: catalog.expiresAt,
    degraded: catalog.degraded,
    warning: catalog.warning,
  };

  if (index.queryCache.size >= MAX_QUERY_CACHE_ENTRIES) {
    const oldestKey = index.queryCache.keys().next().value;
    if (oldestKey !== undefined) index.queryCache.delete(oldestKey);
  }
  index.queryCache.set(cacheKey, response);

  return response;
}

/**
 * Fast O(1)-per-id batch lookup for Favorites, Recent Voices, or Selected Voice hydration.
 */
export async function getVoicesByIds(
  ids: string[],
  overrides: VoiceOverride[]
): Promise<{ voices: SlimVoice[]; version: string; totalCatalog: number; hydrating: boolean }> {
  const uniqueIds = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
  if (uniqueIds.length === 0) {
    const catalog = await fetchVoiceCatalog(false, false);
    const index = getOrBuildMergedIndex(catalog, overrides);
    return {
      voices: [],
      version: index.version,
      totalCatalog: index.items.length,
      hydrating: catalog.hydrating,
    };
  }

  const catalog = await fetchVoiceCatalog(false, false);
  const index = getOrBuildMergedIndex(catalog, overrides);
  const found: SlimVoice[] = [];
  for (const id of uniqueIds) {
    const hit = index.byId.get(id);
    if (hit) found.push(hit.slim);
  }

  return {
    voices: found,
    version: index.version,
    totalCatalog: index.items.length,
    hydrating: catalog.hydrating,
  };
}
