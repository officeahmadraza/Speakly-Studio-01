import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Heart, Library, Search, X } from 'lucide-react';
import { Voice } from '../types/index.js';
import { VoiceCard } from '../components/VoiceCard.js';
import { EmptyState } from '../components/ui/index.js';
import { fetchVoicesByIds } from '../services/api.js';
import { useAudioPlaybackStatus } from '../context/AudioPlayerContext.js';

interface FavoritesViewProps {
  voices: Voice[];
  favoriteIds: string[];
  selectedVoiceId: string | null;
  onToggleFavorite: (voiceId: string) => void;
  onSelectVoice: (voice: Voice) => void;
  onNavigateToLibrary: () => void;
  onNavigateToCreate: () => void;
}

export const FavoritesView: React.FC<FavoritesViewProps> = ({
  voices,
  favoriteIds,
  selectedVoiceId,
  onToggleFavorite,
  onSelectVoice,
  onNavigateToLibrary,
  onNavigateToCreate,
}) => {
  const { activeVoiceId, isPlaying: isAudioPlaying, isLoading: isAudioLoading } =
    useAudioPlaybackStatus();

  const [searchTerm, setSearchTerm] = useState('');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [resolvedFavorites, setResolvedFavorites] = useState<Voice[]>([]);

  useEffect(() => {
    if (favoriteIds.length === 0) {
      setResolvedFavorites([]);
      return;
    }

    const controller = new AbortController();
    fetchVoicesByIds(favoriteIds, controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) {
          setResolvedFavorites(list);
        }
      })
      .catch(() => {
        // Fallback to whatever is already in voices prop
        const favSet = new Set(favoriteIds);
        setResolvedFavorites(voices.filter((v) => favSet.has(v.id)));
      });

    return () => controller.abort();
  }, [favoriteIds, voices]);

  const favoriteVoices = useMemo(() => {
    const seen = new Set<string>();
    const favSet = new Set(favoriteIds);
    const merged = [...resolvedFavorites, ...voices];
    return merged.filter((v) => {
      if (!v || !v.id || seen.has(v.id)) return false;
      if (!favSet.has(v.id)) return false;
      seen.add(v.id);
      return true;
    });
  }, [resolvedFavorites, voices, favoriteIds]);

  const availableLanguages = useMemo(() => {
    const set = new Set<string>();
    favoriteVoices.forEach((v) => v.language && set.add(v.language));
    return Array.from(set).sort();
  }, [favoriteVoices]);

  const filteredFavorites = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return favoriteVoices.filter((v) => {
      if (languageFilter !== 'all' && v.language?.toLowerCase() !== languageFilter.toLowerCase()) {
        return false;
      }
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.accent?.toLowerCase().includes(q) ||
        v.language?.toLowerCase().includes(q) ||
        v.category?.toLowerCase().includes(q)
      );
    });
  }, [favoriteVoices, searchTerm, languageFilter]);

  const handleSelectAndCreate = useCallback(
    (v: Voice) => {
      onSelectVoice(v);
      onNavigateToCreate();
    },
    [onSelectVoice, onNavigateToCreate]
  );

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#11162B] dark:text-[#F3F5FA]">
            Favorites
          </h1>
          <p className="text-xs sm:text-sm text-[#5A6580] dark:text-[#A2ADC7] mt-0.5">
            Your curated collection of saved voice actors, ready for instant studio use.
          </p>
        </div>

        {favoriteVoices.length > 0 && (
          <button
            type="button"
            onClick={onNavigateToLibrary}
            className="h-9 px-4 rounded-xl bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] hover:border-[#2E5BFF] dark:hover:border-[#4D74FF] text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] transition-colors flex items-center gap-2 self-start sm:self-auto cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/30"
          >
            <Library className="w-4 h-4 text-[#2E5BFF] dark:text-[#7A9AFF]" />
            <span>Explore Voice Library</span>
          </button>
        )}
      </div>

      {favoriteVoices.length === 0 ? (
        <EmptyState
          icon={<Heart className="w-6 h-6" />}
          title="No favorite voices saved yet"
          description="Tap the heart icon on any voice actor in the Voice Library to bookmark it here for one-click access."
          action={
            <button
              type="button"
              onClick={onNavigateToLibrary}
              className="px-5 py-2.5 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Library className="w-4 h-4" />
              <span>Browse Voice Library</span>
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Search & Filter Strip */}
          <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#78839E] dark:text-[#7C87A3] pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search saved voices..."
                className="w-full h-10 pl-10 pr-8 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:bg-white dark:focus:bg-[#101521] focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] transition-colors"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#78839E] dark:text-[#7C87A3] hover:text-[#11162B] dark:hover:text-[#F3F5FA] p-1 cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {availableLanguages.length > 0 && (
              <select
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
                aria-label="Filter favorites by language"
                className="h-10 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl px-3 text-xs text-[#11162B] dark:text-[#F3F5FA] font-medium focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] cursor-pointer"
              >
                <option value="all">All Languages</option>
                {availableLanguages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            )}

            <span className="text-xs font-mono tabular-nums text-[#5A6580] dark:text-[#A2ADC7] shrink-0">
              {filteredFavorites.length} saved
            </span>
          </div>

          {filteredFavorites.length === 0 ? (
            <EmptyState
              icon={<Search className="w-5 h-5" />}
              title="No matching favorites"
              description="Clear your search or language filter to view all saved voices."
              action={
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setLanguageFilter('all');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold cursor-pointer transition-colors"
                >
                  Clear Filters
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredFavorites.map((voice) => (
                <VoiceCard
                  key={`fav-${voice.id}`}
                  voice={voice}
                  isFavorite={true}
                  isSelected={voice.id === selectedVoiceId}
                  isPlaying={activeVoiceId === voice.id && isAudioPlaying}
                  isLoadingPreview={activeVoiceId === voice.id && isAudioLoading}
                  onToggleFavorite={onToggleFavorite}
                  onSelectVoice={handleSelectAndCreate}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
