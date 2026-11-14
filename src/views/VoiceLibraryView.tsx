import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Heart,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Clock,
  Play,
  Pause,
} from 'lucide-react';
import { Voice, CatalogInspection } from '../types/index.js';
import { VoiceCard } from '../components/VoiceCard.js';
import { SkeletonCard, EmptyState } from '../components/ui/index.js';
import { fetchVoicesByIds, fetchVoicesPage } from '../services/api.js';
import { getCachedVoicePage, getVoiceCacheMeta } from '../services/voiceCache.js';
import { useAudioActions, useAudioPlaybackStatus } from '../context/AudioPlayerContext.js';

interface VoiceLibraryViewProps {
  voices: Voice[];
  inspection: CatalogInspection | null;
  favoriteIds: string[];
  recentIds: string[];
  selectedVoiceId: string | null;
  isLoading: boolean;
  onRefreshCatalog: () => void;
  onToggleFavorite: (voiceId: string) => void;
  onSelectVoice: (voice: Voice) => void;
  onNavigateToCreate: () => void;
}

type SortOption = 'name-asc' | 'name-desc' | 'category-asc';

const PAGE_SIZE = 24;

const VOICE_CATEGORIES = [
  'All',
  'Conversational',
  'Narration',
  'Professional',
  'Storytelling',
  'Educational',
  'Podcast',
  'Character',
  'Advertisement',
];

export const VoiceLibraryView: React.FC<VoiceLibraryViewProps> = ({
  voices,
  inspection,
  favoriteIds,
  recentIds,
  selectedVoiceId,
  isLoading,
  onRefreshCatalog,
  onToggleFavorite,
  onSelectVoice,
  onNavigateToCreate,
}) => {
  const { playVoicePreview, pause } = useAudioActions();
  const { activeVoiceId, isPlaying: isAudioPlaying, isLoading: isAudioLoading } =
    useAudioPlaybackStatus();

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedGender, setSelectedGender] = useState<string>('all');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [selectedAccent, setSelectedAccent] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('name-asc');
  const [currentPage, setCurrentPage] = useState(1);

  const initialCache = getCachedVoicePage({ page: 1, limit: PAGE_SIZE, sort: 'name-asc' });
  const initialMeta = getVoiceCacheMeta();

  const [pageVoices, setPageVoices] = useState<Voice[]>(() => initialCache?.items || []);
  const [totalMatches, setTotalMatches] = useState<number>(
    () => initialCache?.totalMatches ?? inspection?.totalVoices ?? initialMeta.totalCatalog ?? voices.length
  );
  const [totalCatalog, setTotalCatalog] = useState<number>(
    () => initialCache?.totalCatalog ?? inspection?.totalVoices ?? initialMeta.totalCatalog ?? voices.length
  );
  const [totalPages, setTotalPages] = useState<number>(() => initialCache?.totalPages ?? 1);
  const [isFetchingPage, setIsFetchingPage] = useState<boolean>(() => !initialCache);
  const [facets, setFacets] = useState(() => ({
    genders: initialCache?.facets.genders || inspection?.discoveredGenders || initialMeta.facets?.genders || [],
    languages: initialCache?.facets.languages || inspection?.discoveredLanguages || initialMeta.facets?.languages || [],
    accents: initialCache?.facets.accents || inspection?.discoveredAccents || initialMeta.facets?.accents || [],
  }));

  const [resolvedRecentVoices, setResolvedRecentVoices] = useState<Voice[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const reqSeqRef = useRef<number>(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 180);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Resolve up to 5 recent voices smoothly from cache or batch endpoint
  useEffect(() => {
    if (!recentIds.length) {
      setResolvedRecentVoices([]);
      return;
    }
    const targetIds = Array.from(new Set(recentIds)).slice(0, 5);
    const localMap = new Map(voices.map((v) => [v.id, v]));
    const allLocal = targetIds.every((id) => localMap.has(id));
    if (allLocal) {
      setResolvedRecentVoices(targetIds.map((id) => localMap.get(id)!));
      return;
    }

    const controller = new AbortController();
    fetchVoicesByIds(targetIds, controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setResolvedRecentVoices(list.slice(0, 5));
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [recentIds, voices]);

  const activeFavoriteFilterIds = useMemo(
    () => (showFavoritesOnly ? favoriteIds : null),
    [showFavoritesOnly, favoriteIds]
  );

  // Server-side paginated & cached query
  useEffect(() => {
    if (showFavoritesOnly && (!activeFavoriteFilterIds || activeFavoriteFilterIds.length === 0)) {
      abortRef.current?.abort();
      setPageVoices([]);
      setTotalMatches(0);
      setTotalPages(1);
      setIsFetchingPage(false);
      return;
    }

    const queryOpts = {
      page: currentPage,
      limit: PAGE_SIZE,
      q: debouncedSearch || undefined,
      category: selectedCategory !== 'All' ? selectedCategory : undefined,
      language: selectedLanguage !== 'all' ? selectedLanguage : undefined,
      accent: selectedAccent !== 'all' ? selectedAccent : undefined,
      gender: selectedGender !== 'all' ? selectedGender : undefined,
      sort: sortBy,
      ids: activeFavoriteFilterIds || undefined,
    };

    const cached = getCachedVoicePage(queryOpts);
    if (cached) {
      abortRef.current?.abort();
      setPageVoices(cached.items);
      setTotalMatches(cached.totalMatches);
      setTotalCatalog(cached.totalCatalog);
      setTotalPages(cached.totalPages);
      setFacets({
        genders: cached.facets.genders,
        languages: cached.facets.languages,
        accents: cached.facets.accents,
      });
      setIsFetchingPage(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const reqId = ++reqSeqRef.current;

    setIsFetchingPage(true);
    fetchVoicesPage({ ...queryOpts, signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted || reqId !== reqSeqRef.current) return;
        setPageVoices(res.items);
        setTotalMatches(res.totalMatches);
        setTotalCatalog(res.totalCatalog);
        setTotalPages(res.totalPages);
        setFacets({
          genders: res.facets.genders,
          languages: res.facets.languages,
          accents: res.facets.accents,
        });
        setIsFetchingPage(false);
      })
      .catch((err: any) => {
        if (err?.name === 'AbortError' || controller.signal.aborted) return;
        if (reqId !== reqSeqRef.current) return;
        setIsFetchingPage(false);
      });

    return () => controller.abort();
  }, [
    currentPage,
    debouncedSearch,
    selectedCategory,
    selectedLanguage,
    selectedAccent,
    selectedGender,
    sortBy,
    showFavoritesOnly,
    activeFavoriteFilterIds,
    inspection?.fetchedAt,
  ]);

  const handleFilterChange = (setter: (v: string) => void, val: string) => {
    setter(val);
    setCurrentPage(1);
  };

  const availableGenders = facets.genders.length > 0 ? facets.genders : inspection?.discoveredGenders || [];
  const availableLanguages =
    facets.languages.length > 0 ? facets.languages : inspection?.discoveredLanguages || [];
  const availableAccents = facets.accents.length > 0 ? facets.accents : inspection?.discoveredAccents || [];

  const activeChips: { label: string; onRemove: () => void }[] = [];
  if (debouncedSearch) activeChips.push({ label: `Search: "${debouncedSearch}"`, onRemove: () => setSearchTerm('') });
  if (selectedCategory !== 'All') activeChips.push({ label: `Style: ${selectedCategory}`, onRemove: () => setSelectedCategory('All') });
  if (selectedGender !== 'all') activeChips.push({ label: `Gender: ${selectedGender}`, onRemove: () => setSelectedGender('all') });
  if (selectedLanguage !== 'all') activeChips.push({ label: `Language: ${selectedLanguage}`, onRemove: () => setSelectedLanguage('all') });
  if (selectedAccent !== 'all') activeChips.push({ label: `Accent: ${selectedAccent}`, onRemove: () => setSelectedAccent('all') });
  if (showFavoritesOnly) activeChips.push({ label: 'Favorites Only', onRemove: () => setShowFavoritesOnly(false) });

  const clearAllFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setSelectedGender('all');
    setSelectedLanguage('all');
    setSelectedAccent('all');
    setSelectedCategory('All');
    setShowFavoritesOnly(false);
    setCurrentPage(1);
  };

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const handleSelectAndOpenCreate = useCallback(
    (voice: Voice) => {
      onSelectVoice(voice);
      onNavigateToCreate();
    },
    [onSelectVoice, onNavigateToCreate]
  );

  const displayCatalogCount = Math.max(totalCatalog, inspection?.totalVoices || 0, voices.length);

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#11162B] dark:text-[#F3F5FA]">
            Voice Library
          </h1>
          <p className="text-xs sm:text-sm text-[#5A6580] dark:text-[#A2ADC7] mt-0.5">
            Explore and audition <span className="font-mono tabular-nums font-semibold text-[#11162B] dark:text-[#F3F5FA]">{displayCatalogCount.toLocaleString()}</span> verified voices across styles, accents, and languages.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefreshCatalog}
          disabled={isLoading}
          className="h-9 px-4 rounded-xl bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] hover:border-[#2E5BFF] dark:hover:border-[#4D74FF] text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer self-start sm:self-auto whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/30"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#2E5BFF] dark:text-[#7A9AFF]' : 'text-[#5A6580] dark:text-[#A2ADC7]'}`} />
          <span>Sync Catalog</span>
        </button>
      </div>

      {/* Category Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {VOICE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => handleFilterChange(setSelectedCategory, cat)}
            className={`h-9 px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/30 ${
              selectedCategory === cat
                ? 'bg-[#2E5BFF] dark:bg-[#4D74FF] text-white'
                : 'bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Recently Used / Auditioned Voices Strip */}
      {resolvedRecentVoices.length > 0 && !showFavoritesOnly && !debouncedSearch && (
        <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2.5 text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA]">
            <Clock className="w-3.5 h-3.5 text-[#2E5BFF] dark:text-[#7A9AFF]" />
            <span>Recently Used Voices</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
            {resolvedRecentVoices.map((voice) => {
              const playingRecent = activeVoiceId === voice.id && isAudioPlaying;
              return (
                <div
                  key={`recent-${voice.id}`}
                  className="inline-flex items-center rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] hover:border-[#2E5BFF]/50 dark:hover:border-[#4D74FF]/50 transition-colors shrink-0 overflow-hidden"
                >
                  {voice.previewUrl && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (playingRecent) pause();
                        else playVoicePreview(voice);
                      }}
                      title={playingRecent ? 'Pause preview' : 'Preview voice'}
                      aria-label={playingRecent ? `Pause ${voice.name}` : `Preview ${voice.name}`}
                      className={`pl-2.5 pr-1.5 py-2 transition-colors cursor-pointer focus-visible:outline-none ${
                        playingRecent ? 'text-[#2E5BFF] dark:text-[#7A9AFF]' : 'text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#2E5BFF] dark:hover:text-[#7A9AFF]'
                      }`}
                    >
                      {playingRecent ? (
                        <Pause className="w-3 h-3 fill-current" />
                      ) : (
                        <Play className="w-3 h-3 fill-current" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSelectAndOpenCreate(voice)}
                    className={`py-1.5 pr-3 text-xs text-[#11162B] dark:text-[#F3F5FA] hover:text-[#2E5BFF] dark:hover:text-[#7A9AFF] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap focus-visible:outline-none ${
                      voice.previewUrl ? 'pl-1' : 'pl-3'
                    }`}
                  >
                    <span className="font-semibold">{voice.name}</span>
                    {voice.language && <span className="text-[#5A6580] dark:text-[#A2ADC7]">· {voice.language}</span>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search & Filters Card */}
      <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#78839E] dark:text-[#7C87A3] pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, Voice ID, tone, language, or accent..."
              className="w-full pl-10 pr-9 h-10 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:bg-white dark:focus:bg-[#101521] focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] focus:ring-2 focus:ring-[#2E5BFF]/15 transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setDebouncedSearch('');
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#78839E] dark:text-[#7C87A3] hover:text-[#11162B] dark:hover:text-[#F3F5FA] p-1 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:items-center gap-2">
            {availableLanguages.length > 0 && (
              <select
                value={selectedLanguage}
                onChange={(e) => handleFilterChange(setSelectedLanguage, e.target.value)}
                aria-label="Filter by language"
                className="h-10 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl px-3 text-xs text-[#11162B] dark:text-[#F3F5FA] font-medium focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] cursor-pointer"
              >
                <option value="all">All Languages</option>
                {availableLanguages.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            )}

            {availableAccents.length > 0 && (
              <select
                value={selectedAccent}
                onChange={(e) => handleFilterChange(setSelectedAccent, e.target.value)}
                aria-label="Filter by accent"
                className="h-10 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl px-3 text-xs text-[#11162B] dark:text-[#F3F5FA] font-medium focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] capitalize cursor-pointer"
              >
                <option value="all">All Accents</option>
                {availableAccents.map((a) => (
                  <option key={a} value={a} className="capitalize">
                    {a}
                  </option>
                ))}
              </select>
            )}

            {availableGenders.length > 0 && (
              <select
                value={selectedGender}
                onChange={(e) => handleFilterChange(setSelectedGender, e.target.value)}
                aria-label="Filter by gender"
                className="h-10 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl px-3 text-xs text-[#11162B] dark:text-[#F3F5FA] font-medium focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] capitalize cursor-pointer"
              >
                <option value="all">All Genders</option>
                {availableGenders.map((g) => (
                  <option key={g} value={g} className="capitalize">
                    {g}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => {
                setShowFavoritesOnly((prev) => !prev);
                setCurrentPage(1);
              }}
              className={`h-10 flex items-center justify-center gap-1.5 px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/30 ${
                showFavoritesOnly
                  ? 'bg-[#DC2626]/10 border-[#DC2626]/30 text-[#DC2626] dark:text-[#F87171]'
                  : 'bg-[#F7F8FA] dark:bg-[#0D121D] border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA]'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${showFavoritesOnly ? 'fill-[#DC2626] dark:fill-[#F87171]' : ''}`} />
              <span className="tabular-nums">Favorites ({favoriteIds.length})</span>
            </button>

            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as SortOption);
                setCurrentPage(1);
              }}
              aria-label="Sort voices"
              className="h-10 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl px-3 text-xs text-[#11162B] dark:text-[#F3F5FA] font-medium focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] cursor-pointer"
            >
              <option value="name-asc">Sort: A–Z</option>
              <option value="name-desc">Sort: Z–A</option>
              <option value="category-asc">Sort: Style</option>
            </select>
          </div>
        </div>

        {/* Summary & Active Filter Reset */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#5A6580] dark:text-[#A2ADC7]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono tabular-nums font-semibold text-[#11162B] dark:text-[#F3F5FA]">
              {totalMatches.toLocaleString()} {totalMatches === 1 ? 'voice' : 'voices'}
            </span>
            {activeChips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={chip.onRemove}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] text-xs font-medium cursor-pointer hover:bg-[#E0E7FF] dark:hover:bg-[#4D74FF]/22 transition-colors"
              >
                <span>{chip.label}</span>
                <X className="w-3 h-3" />
              </button>
            ))}
            {activeChips.length > 0 && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs text-[#2E5BFF] dark:text-[#7A9AFF] hover:underline font-semibold cursor-pointer ml-1"
              >
                Clear All
              </button>
            )}
          </div>

          {totalPages > 1 && (
            <span className="font-mono tabular-nums">
              Page {currentPage} of {totalPages}
            </span>
          )}
        </div>
      </div>

      {/* Voice Grid */}
      {isFetchingPage && pageVoices.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : pageVoices.length === 0 ? (
        <EmptyState
          icon={<SlidersHorizontal className="w-6 h-6" />}
          title="No voices match your filters"
          description="Try broadening your search terms or clearing active category and language filters."
          action={
            <button
              type="button"
              onClick={clearAllFilters}
              className="px-4 py-2 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold cursor-pointer transition-colors"
            >
              Reset All Filters
            </button>
          }
        />
      ) : (
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 transition-opacity duration-150 ${
            isFetchingPage ? 'opacity-60' : 'opacity-100'
          }`}
        >
          {pageVoices.map((voice) => (
            <VoiceCard
              key={`library-${voice.id}`}
              voice={voice}
              isFavorite={favoriteSet.has(voice.id)}
              isSelected={voice.id === selectedVoiceId}
              isPlaying={activeVoiceId === voice.id && isAudioPlaying}
              isLoadingPreview={activeVoiceId === voice.id && isAudioLoading}
              onToggleFavorite={onToggleFavorite}
              onSelectVoice={handleSelectAndOpenCreate}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#5A6580] dark:text-[#A2ADC7]">
          <span className="font-mono tabular-nums">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalMatches)} of{' '}
            {totalMatches.toLocaleString()}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1 || isFetchingPage}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-9 px-3 rounded-xl border border-[#E4E7EF] dark:border-[#1E2638] bg-white dark:bg-[#101521] hover:border-[#2E5BFF] text-[#11162B] dark:text-[#F3F5FA] disabled:opacity-40 cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Prev</span>
            </button>
            <span className="font-mono tabular-nums px-2 font-semibold text-[#11162B] dark:text-[#F3F5FA]">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages || isFetchingPage}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="h-9 px-3 rounded-xl border border-[#E4E7EF] dark:border-[#1E2638] bg-white dark:bg-[#101521] hover:border-[#2E5BFF] text-[#11162B] dark:text-[#F3F5FA] disabled:opacity-40 cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
