import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { X, Search, Heart, Loader2 } from 'lucide-react';
import { Voice } from '../types/index.js';
import { VoiceCard } from './VoiceCard.js';
import { SkeletonCard } from './ui/index.js';
import { fetchVoicesPage } from '../services/api.js';
import { getCachedVoicePage, getVoiceCacheMeta } from '../services/voiceCache.js';
import { useAudioPlaybackStatus } from '../context/AudioPlayerContext.js';

interface VoiceSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  voices?: Voice[];
  totalVoiceCount?: number;
  selectedVoiceId: string | null;
  favoriteIds: string[];
  recentIds: string[];
  onSelectVoice: (voice: Voice) => void;
  onToggleFavorite: (voiceId: string) => void;
}

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

const PAGE_SIZE = 24;
const ESTIMATED_ROW_HEIGHT = 216;
const ROW_GAP_PX = 14;
const OVERSCAN_ROWS = 4;

export const VoiceSelectorModal: React.FC<VoiceSelectorModalProps> = ({
  isOpen,
  onClose,
  totalVoiceCount,
  selectedVoiceId,
  favoriteIds,
  onSelectVoice,
  onToggleFavorite,
}) => {
  const { activeVoiceId, isPlaying: isAudioPlaying, isLoading: isAudioLoading } =
    useAudioPlaybackStatus();

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedGender, setSelectedGender] = useState<string>('all');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [selectedAccent, setSelectedAccent] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Instant-cached Page 1 hydration state
  const initialMeta = getVoiceCacheMeta();
  const initialDefaultPage = getCachedVoicePage({ page: 1, limit: PAGE_SIZE });

  const [items, setItems] = useState<Voice[]>(() => initialDefaultPage?.items || []);
  const [totalMatches, setTotalMatches] = useState<number>(
    () => initialDefaultPage?.totalMatches ?? totalVoiceCount ?? initialMeta.totalCatalog ?? 0
  );
  const [totalCatalog, setTotalCatalog] = useState<number>(
    () => initialDefaultPage?.totalCatalog ?? totalVoiceCount ?? initialMeta.totalCatalog ?? 0
  );
  const [hasMore, setHasMore] = useState<boolean>(() => initialDefaultPage?.hasMore ?? true);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(
    () => !initialDefaultPage
  );
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [facets, setFacets] = useState(() => ({
    languages: initialDefaultPage?.facets.languages || initialMeta.facets?.languages || [],
    accents: initialDefaultPage?.facets.accents || initialMeta.facets?.accents || [],
    genders: initialDefaultPage?.facets.genders || initialMeta.facets?.genders || [],
  }));

  // Virtualization state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef<number>(0);
  const loadingMoreRef = useRef<boolean>(false);
  const rowHeightsRef = useRef<Map<number, number>>(new Map());
  const rowMeasureRafRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);

  const [columns, setColumns] = useState<number>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 768 ? 2 : 1
  );
  const [scrollTop, setScrollTop] = useState<number>(0);
  const [viewportHeight, setViewportHeight] = useState<number>(520);
  const [heightMeasureVersion, setHeightMeasureVersion] = useState<number>(0);

  // Responsive column count matching Tailwind `md:grid-cols-2`
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const updateCols = () => {
      const next = mq.matches ? 2 : 1;
      setColumns((prev) => {
        if (prev !== next) {
          rowHeightsRef.current.clear();
        }
        return next;
      });
    };
    updateCols();
    mq.addEventListener('change', updateCols);
    return () => mq.removeEventListener('change', updateCols);
  }, []);

  // Measure scroll viewport height when modal opens or resizes
  useEffect(() => {
    if (!isOpen) return;
    const el = scrollContainerRef.current;
    if (!el) return;

    const updateHeight = () => {
      const h = el.clientHeight;
      if (h > 0) setViewportHeight(h);
    };
    updateHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateHeight);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [isOpen]);

  // Sync totalCatalog badge if background server hydration finishes while modal is open
  useEffect(() => {
    if (totalVoiceCount && totalVoiceCount > totalCatalog) {
      setTotalCatalog(totalVoiceCount);
    }
  }, [totalVoiceCount, totalCatalog]);

  // Reset search & filters strictly when modal transitions closed -> open (user-confirmed behavior)
  useEffect(() => {
    if (!isOpen) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      return;
    }

    setSearchTerm('');
    setDebouncedSearch('');
    setSelectedGender('all');
    setSelectedLanguage('all');
    setSelectedAccent('all');
    setSelectedCategory('All');
    setShowFavoritesOnly(false);
    setFetchError(null);
    setScrollTop(0);
    rowHeightsRef.current.clear();

    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }

    const cached = getCachedVoicePage({ page: 1, limit: PAGE_SIZE });
    const meta = getVoiceCacheMeta();
    if (cached) {
      setItems(cached.items);
      setTotalMatches(cached.totalMatches);
      setTotalCatalog(Math.max(cached.totalCatalog, totalVoiceCount || 0));
      setHasMore(cached.hasMore);
      setCurrentPage(1);
      setIsInitialLoading(false);
      setFacets({
        languages: cached.facets.languages,
        accents: cached.facets.accents,
        genders: cached.facets.genders,
      });
    } else {
      setItems([]);
      setCurrentPage(1);
      setHasMore(true);
      setIsInitialLoading(true);
      if (totalVoiceCount || meta.totalCatalog) {
        setTotalCatalog(totalVoiceCount || meta.totalCatalog);
      }
    }
  }, [isOpen]);

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Debounce search text cleanly (200ms)
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      setDebouncedSearch('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearch(trimmed);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchTerm, isOpen]);

  const activeFavoriteFilterIds = useMemo(
    () => (showFavoritesOnly ? favoriteIds : null),
    [showFavoritesOnly, favoriteIds]
  );

  // Fetch Page 1 whenever query/filter state changes while modal is open
  useEffect(() => {
    if (!isOpen) return;

    // If Saved Only is toggled with 0 favorites, resolve instantaneously with 0 network calls
    if (showFavoritesOnly && (!activeFavoriteFilterIds || activeFavoriteFilterIds.length === 0)) {
      abortControllerRef.current?.abort();
      setItems([]);
      setTotalMatches(0);
      setHasMore(false);
      setIsInitialLoading(false);
      setIsLoadingMore(false);
      setFetchError(null);
      return;
    }

    const queryOpts = {
      page: 1,
      limit: PAGE_SIZE,
      q: debouncedSearch || undefined,
      category: selectedCategory !== 'All' ? selectedCategory : undefined,
      language: selectedLanguage !== 'all' ? selectedLanguage : undefined,
      accent: selectedAccent !== 'all' ? selectedAccent : undefined,
      gender: selectedGender !== 'all' ? selectedGender : undefined,
      ids: activeFavoriteFilterIds || undefined,
    };

    const cached = getCachedVoicePage(queryOpts);
    if (cached) {
      abortControllerRef.current?.abort();
      rowHeightsRef.current.clear();
      setItems(cached.items);
      setTotalMatches(cached.totalMatches);
      setTotalCatalog(cached.totalCatalog);
      setHasMore(cached.hasMore);
      setCurrentPage(1);
      setIsInitialLoading(false);
      setIsLoadingMore(false);
      setFetchError(null);
      setFacets({
        languages: cached.facets.languages,
        accents: cached.facets.accents,
        genders: cached.facets.genders,
      });
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
        setScrollTop(0);
      }
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const reqId = ++requestSeqRef.current;

    setIsInitialLoading(true);
    setIsLoadingMore(false);
    setFetchError(null);
    loadingMoreRef.current = false;

    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
      setScrollTop(0);
    }

    fetchVoicesPage({ ...queryOpts, signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted || reqId !== requestSeqRef.current) return;
        rowHeightsRef.current.clear();
        setItems(res.items);
        setTotalMatches(res.totalMatches);
        setTotalCatalog(res.totalCatalog);
        setHasMore(res.hasMore);
        setCurrentPage(1);
        setFacets({
          languages: res.facets.languages,
          accents: res.facets.accents,
          genders: res.facets.genders,
        });
        setIsInitialLoading(false);
      })
      .catch((err: any) => {
        if (err?.name === 'AbortError' || controller.signal.aborted) return;
        if (reqId !== requestSeqRef.current) return;
        setFetchError(err?.message || 'Unable to load voices right now.');
        setIsInitialLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [
    isOpen,
    debouncedSearch,
    selectedCategory,
    selectedLanguage,
    selectedAccent,
    selectedGender,
    showFavoritesOnly,
    activeFavoriteFilterIds,
  ]);

  // Load next page on infinite scroll
  const loadMore = useCallback(async () => {
    if (!isOpen || !hasMore || isInitialLoading || loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    setIsLoadingMore(true);

    const nextPage = currentPage + 1;
    const reqSeq = requestSeqRef.current;
    const controller = abortControllerRef.current;

    try {
      const res = await fetchVoicesPage({
        page: nextPage,
        limit: PAGE_SIZE,
        q: debouncedSearch || undefined,
        category: selectedCategory !== 'All' ? selectedCategory : undefined,
        language: selectedLanguage !== 'all' ? selectedLanguage : undefined,
        accent: selectedAccent !== 'all' ? selectedAccent : undefined,
        gender: selectedGender !== 'all' ? selectedGender : undefined,
        ids: showFavoritesOnly ? favoriteIds : undefined,
        signal: controller?.signal,
      });

      if (controller?.signal.aborted || reqSeq !== requestSeqRef.current) return;

      setItems((prev) => {
        const seen = new Set(prev.map((v) => v.id));
        const merged = [...prev];
        for (const item of res.items) {
          if (item?.id && !seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        }
        return merged;
      });
      setCurrentPage(nextPage);
      setTotalMatches(res.totalMatches);
      setTotalCatalog(res.totalCatalog);
      setHasMore(res.hasMore);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn('Load more voices warning:', err?.message || err);
      }
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [
    isOpen,
    hasMore,
    isInitialLoading,
    currentPage,
    debouncedSearch,
    selectedCategory,
    selectedLanguage,
    selectedAccent,
    selectedGender,
    showFavoritesOnly,
    favoriteIds,
  ]);

  // IntersectionObserver for automatic infinite scroll
  useEffect(() => {
    if (!isOpen || !hasMore || isInitialLoading) return;
    const sentinel = sentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { root, rootMargin: '360px 0px', threshold: 0.01 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isOpen, hasMore, isInitialLoading, loadMore, items.length]);

  // Scroll tracking throttled via requestAnimationFrame
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (scrollContainerRef.current) {
        setScrollTop(scrollContainerRef.current.scrollTop);
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
      if (rowMeasureRafRef.current !== null) cancelAnimationFrame(rowMeasureRafRef.current);
    };
  }, []);

  // Group items into virtualized rows
  const rows = useMemo(() => {
    const grouped: Voice[][] = [];
    for (let i = 0; i < items.length; i += columns) {
      grouped.push(items.slice(i, i + columns));
    }
    return grouped;
  }, [items, columns]);

  // Compute cumulative row offsets from measured + estimated row heights
  const rowLayout = useMemo(() => {
    const offsets: { top: number; height: number; bottom: number }[] = [];
    let cursor = 0;
    for (let i = 0; i < rows.length; i++) {
      const h = rowHeightsRef.current.get(i) ?? ESTIMATED_ROW_HEIGHT;
      offsets.push({ top: cursor, height: h, bottom: cursor + h });
      cursor += h;
    }
    return { offsets, totalHeight: cursor };
  }, [rows.length, heightMeasureVersion]);

  // Compute visible row range [startRow, endRow] + overscan
  const visibleRange = useMemo(() => {
    const offsets = rowLayout.offsets;
    if (offsets.length === 0) return { startRow: 0, endRow: -1, topPadding: 0, bottomPadding: 0 };

    // Binary search first row whose bottom > scrollTop
    let lo = 0;
    let hi = offsets.length - 1;
    let firstVisible = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid].bottom > scrollTop) {
        firstVisible = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }

    const viewBottom = scrollTop + viewportHeight;
    let lastVisible = firstVisible;
    while (lastVisible < offsets.length - 1 && offsets[lastVisible].top < viewBottom) {
      lastVisible++;
    }

    const startRow = Math.max(0, firstVisible - OVERSCAN_ROWS);
    const endRow = Math.min(offsets.length - 1, lastVisible + OVERSCAN_ROWS);

    const topPadding = offsets[startRow]?.top ?? 0;
    const endBottom = offsets[endRow]?.bottom ?? rowLayout.totalHeight;
    const bottomPadding = Math.max(0, rowLayout.totalHeight - endBottom);

    return { startRow, endRow, topPadding, bottomPadding };
  }, [rowLayout, scrollTop, viewportHeight]);

  // Measure actual rendered row height so dynamic 1-line/2-line descriptions never drift or overlap
  const measureRowRef = useCallback((rowIdx: number, el: HTMLDivElement | null) => {
    if (!el) return;
    const measured = Math.ceil(el.getBoundingClientRect().height) + ROW_GAP_PX;
    const prev = rowHeightsRef.current.get(rowIdx);
    if (prev === undefined || Math.abs(prev - measured) >= 2) {
      rowHeightsRef.current.set(rowIdx, measured);
      if (rowMeasureRafRef.current === null) {
        rowMeasureRafRef.current = requestAnimationFrame(() => {
          rowMeasureRafRef.current = null;
          setHeightMeasureVersion((v) => v + 1);
        });
      }
    }
  }, []);

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const handleSelectAndClose = useCallback(
    (voice: Voice) => {
      onSelectVoice(voice);
      onClose();
    },
    [onSelectVoice, onClose]
  );

  const resetAllFilters = useCallback(() => {
    setSearchTerm('');
    setDebouncedSearch('');
    setSelectedGender('all');
    setSelectedLanguage('all');
    setSelectedAccent('all');
    setSelectedCategory('All');
    setShowFavoritesOnly(false);
  }, []);

  if (!isOpen) return null;

  const isFiltering =
    Boolean(debouncedSearch) ||
    selectedCategory !== 'All' ||
    selectedGender !== 'all' ||
    selectedLanguage !== 'all' ||
    selectedAccent !== 'all' ||
    showFavoritesOnly;

  const displayTotal = totalCatalog || totalMatches;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#090C12]/60 dark:bg-black/75 backdrop-blur-[2px] transition-opacity duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[92vh] sm:max-h-[86vh] bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl flex flex-col shadow-2xl overflow-hidden will-change-transform animate-studio-enter"
        role="dialog"
        aria-modal="true"
        aria-labelledby="selector-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#E4E7EF] dark:border-[#1E2638]">
          <div>
            <h2
              id="selector-modal-title"
              className="font-display text-base font-bold text-[#11162B] dark:text-[#F3F5FA] tracking-tight"
            >
              Select Voice Actor
            </h2>
            <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] mt-0.5">
              Audition and select from the verified catalog without losing your script
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] transition-colors duration-150 flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
            aria-label="Close voice selector"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Category Tabs + Search & Filters */}
        <div className="px-5 sm:px-6 py-3.5 border-b border-[#E4E7EF] dark:border-[#1E2638] bg-[#F7F8FA] dark:bg-[#0D121D] space-y-3">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {VOICE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`h-8 px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 ${
                  selectedCategory === cat
                    ? 'bg-[#2E5BFF] dark:bg-[#4D74FF] text-white'
                    : 'bg-white dark:bg-[#101521] text-[#5A6580] dark:text-[#A2ADC7] border border-[#E4E7EF] dark:border-[#1E2638] hover:text-[#11162B] dark:hover:text-[#F3F5FA] hover:border-[#CFD6E6] dark:hover:border-[#2C364F]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div className="relative flex-1 min-w-0">
              {isInitialLoading && searchTerm ? (
                <Loader2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#2E5BFF] dark:text-[#7A9AFF] animate-spin pointer-events-none" />
              ) : (
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#78839E] dark:text-[#7C87A3] pointer-events-none" />
              )}
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by voice name, ID, style, or accent..."
                className="w-full h-9 pl-9 pr-8 bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-lg text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] focus:ring-2 focus:ring-[#2E5BFF]/15"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setDebouncedSearch('');
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#78839E] hover:text-[#11162B] dark:hover:text-[#F3F5FA] p-1 cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
              {facets.languages.length > 0 && (
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  aria-label="Filter by language"
                  className="h-9 bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-lg px-2.5 text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] font-medium"
                >
                  <option value="all">All Languages</option>
                  {facets.languages.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              )}

              {facets.accents.length > 0 && (
                <select
                  value={selectedAccent}
                  onChange={(e) => setSelectedAccent(e.target.value)}
                  aria-label="Filter by accent"
                  className="h-9 bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-lg px-2.5 text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] font-medium capitalize"
                >
                  <option value="all">All Accents</option>
                  {facets.accents.map((a) => (
                    <option key={a} value={a} className="capitalize">
                      {a}
                    </option>
                  ))}
                </select>
              )}

              {facets.genders.length > 0 && (
                <select
                  value={selectedGender}
                  onChange={(e) => setSelectedGender(e.target.value)}
                  aria-label="Filter by gender"
                  className="h-9 bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-lg px-2.5 text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] font-medium capitalize"
                >
                  <option value="all">All Genders</option>
                  {facets.genders.map((g) => (
                    <option key={g} value={g} className="capitalize">
                      {g}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={() => setShowFavoritesOnly((prev) => !prev)}
                className={`h-9 flex items-center justify-center gap-1.5 px-3 rounded-lg text-xs font-medium border transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 ${
                  showFavoritesOnly
                    ? 'bg-[#DC2626]/10 border-[#DC2626]/30 text-[#DC2626] dark:text-[#F87171]'
                    : 'bg-white dark:bg-[#101521] border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA]'
                }`}
              >
                <Heart className={`w-3.5 h-3.5 ${showFavoritesOnly ? 'fill-[#DC2626] dark:fill-[#F87171]' : ''}`} />
                <span>Saved</span>
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Virtualized Voices Grid */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 sm:p-5 bg-[#F7F8FA] dark:bg-[#090C12]"
        >
          {isInitialLoading && items.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {Array.from({ length: 6 }).map((_, idx) => (
                <SkeletonCard key={`selector-skeleton-${idx}`} />
              ))}
            </div>
          ) : fetchError && items.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-[#5A6580] dark:text-[#A2ADC7]">{fetchError}</p>
              <button
                type="button"
                onClick={resetAllFilters}
                className="mt-3 text-xs text-[#2E5BFF] dark:text-[#7A9AFF] hover:underline font-medium cursor-pointer"
              >
                Retry loading voices
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-[#5A6580] dark:text-[#A2ADC7]">
                {showFavoritesOnly && favoriteIds.length === 0
                  ? 'You have no saved favorite voices yet.'
                  : 'No voices match your active filters.'}
              </p>
              {isFiltering && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="mt-3 text-xs text-[#2E5BFF] dark:text-[#7A9AFF] hover:underline font-medium cursor-pointer"
                >
                  Reset all filters
                </button>
              )}
            </div>
          ) : (
            <div
              style={{
                paddingTop: `${visibleRange.topPadding}px`,
                paddingBottom: `${visibleRange.bottomPadding}px`,
              }}
            >
              {rows
                .slice(visibleRange.startRow, visibleRange.endRow + 1)
                .map((rowVoices, localIdx) => {
                  const rowIndex = visibleRange.startRow + localIdx;
                  return (
                    <div
                      key={`voice-row-${rowIndex}-${rowVoices[0]?.id}`}
                      ref={(el) => measureRowRef(rowIndex, el)}
                      className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-3.5 items-stretch"
                    >
                      {rowVoices.map((voice) => (
                        <VoiceCard
                          key={`modal-voice-${voice.id}`}
                          voice={voice}
                          isFavorite={favoriteSet.has(voice.id)}
                          isSelected={voice.id === selectedVoiceId}
                          isPlaying={activeVoiceId === voice.id && isAudioPlaying}
                          isLoadingPreview={activeVoiceId === voice.id && isAudioLoading}
                          onToggleFavorite={onToggleFavorite}
                          onSelectVoice={handleSelectAndClose}
                        />
                      ))}
                    </div>
                  );
                })}

              {/* Infinite scroll sentinel & bottom loader */}
              <div ref={sentinelRef} className="h-4 w-full" aria-hidden="true" />
              {isLoadingMore && (
                <div className="py-3 flex items-center justify-center gap-2 text-xs text-[#5A6580] dark:text-[#A2ADC7]">
                  <Loader2 className="w-4 h-4 animate-spin text-[#2E5BFF] dark:text-[#7A9AFF]" />
                  <span>Loading more voices...</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-6 py-3 border-t border-[#E4E7EF] dark:border-[#1E2638] bg-white dark:bg-[#101521] flex items-center justify-between text-xs text-[#5A6580] dark:text-[#A2ADC7]">
          <span className="font-mono tabular-nums">
            Showing{' '}
            <strong className="font-semibold text-[#11162B] dark:text-[#F3F5FA]">
              {isInitialLoading && items.length === 0 ? '...' : totalMatches.toLocaleString()}
            </strong>{' '}
            of {displayTotal.toLocaleString()} voices
            {items.length > 0 && items.length < totalMatches && (
              <span className="text-[#78839E] dark:text-[#7C87A3]"> · {items.length.toLocaleString()} loaded</span>
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-lg bg-[#F2F4F8] dark:bg-[#171E2E] hover:bg-[#E4E7EF] dark:hover:bg-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
