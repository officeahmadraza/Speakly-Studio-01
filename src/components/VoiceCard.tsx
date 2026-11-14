import React, { useState, useCallback, useMemo } from 'react';
import { Play, Pause, Loader2, Heart, Check, VolumeX, Copy } from 'lucide-react';
import { Voice } from '../types/index.js';
import { useAudioActions } from '../context/AudioPlayerContext.js';

export function getVoiceInitials(name: string): string {
  if (!name) return 'VA';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function getVoiceAvatarGradient(name: string): string {
  const gradients = [
    'from-[#315BFA] to-[#7657F6]',
    'from-[#4E73FF] to-[#5F41E5]',
    'from-[#16A675] to-[#0E8782]',
    'from-[#6246EA] to-[#315BFA]',
    'from-[#D96B27] to-[#E7A23B]',
    'from-[#2563EB] to-[#0EA5E9]',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

interface VoiceCardProps {
  voice: Voice;
  isFavorite: boolean;
  isSelected: boolean;
  isPlaying?: boolean;
  isLoadingPreview?: boolean;
  onToggleFavorite: (voiceId: string) => void;
  onSelectVoice: (voice: Voice) => void;
}

const VoiceCardComponent: React.FC<VoiceCardProps> = ({
  voice,
  isFavorite,
  isSelected,
  isPlaying = false,
  isLoadingPreview = false,
  onToggleFavorite,
  onSelectVoice,
}) => {
  const { playVoicePreview, pause } = useAudioActions();
  const [copiedId, setCopiedId] = useState(false);

  const playing = isPlaying;
  const loading = isLoadingPreview;
  const hasPreview = Boolean(voice.previewUrl);

  const handlePreviewClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!hasPreview) return;
      if (playing) {
        pause();
      } else {
        playVoicePreview(voice);
      }
    },
    [hasPreview, playing, pause, playVoicePreview, voice]
  );

  const handleFavoriteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleFavorite(voice.id);
    },
    [onToggleFavorite, voice.id]
  );

  const handleCopyId = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(voice.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    },
    [voice.id]
  );

  const handleCardSelect = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelectVoice(voice);
    },
    [onSelectVoice, voice]
  );

  const avatarGradient = useMemo(() => getVoiceAvatarGradient(voice.name), [voice.name]);
  const initials = useMemo(() => getVoiceInitials(voice.name), [voice.name]);

  const metadataParts = useMemo(() => {
    const parts: string[] = [];
    if (voice.language) parts.push(voice.language);
    if (voice.accent) parts.push(voice.accent);
    if (voice.gender) parts.push(voice.gender);
    if (voice.age) parts.push(voice.age);
    if (voice.category) parts.push(voice.category);
    return parts;
  }, [voice.language, voice.accent, voice.gender, voice.age, voice.category]);

  return (
    <div
      onClick={() => onSelectVoice(voice)}
      className={`group relative h-full flex flex-col justify-between p-4 rounded-2xl border transition-all duration-150 cursor-pointer ${
        isSelected
          ? 'bg-[#EEF2FF]/65 dark:bg-[#4D74FF]/14 border-[#2E5BFF] dark:border-[#4D74FF]'
          : 'bg-white dark:bg-[#101521] border-[#E4E7EF] dark:border-[#1E2638] hover:border-[#2E5BFF]/50 dark:hover:border-[#4D74FF]/50 hover:shadow-[0_6px_18px_rgba(17,22,43,0.04)]'
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-2.5 mb-2.5">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className={`relative w-10 h-10 rounded-xl bg-gradient-to-br ${avatarGradient} flex items-center justify-center font-display font-bold text-xs text-white shrink-0 select-none ${
                playing ? 'ring-2 ring-[#2E5BFF] dark:ring-[#4D74FF] ring-offset-2 dark:ring-offset-[#101521]' : ''
              }`}
            >
              {playing ? (
                <div className="flex items-end gap-[2px] h-3.5" aria-hidden="true">
                  <span className="w-[2.5px] rounded-full bg-white animate-waveform-bar" style={{ animationDelay: '0ms' }} />
                  <span className="w-[2.5px] rounded-full bg-white animate-waveform-bar" style={{ animationDelay: '150ms' }} />
                  <span className="w-[2.5px] rounded-full bg-white animate-waveform-bar" style={{ animationDelay: '300ms' }} />
                </div>
              ) : (
                initials
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-[#11162B] dark:text-[#F3F5FA] group-hover:text-[#2E5BFF] dark:group-hover:text-[#7A9AFF] text-sm tracking-tight truncate transition-colors">
                  {voice.name}
                </h3>
              </div>

              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className="font-mono text-[11px] text-[#5A6580] dark:text-[#A2ADC7] truncate max-w-[140px]"
                  title={`Voice ID: ${voice.id}`}
                >
                  {voice.id}
                </span>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="min-w-[22px] min-h-[22px] p-0.5 rounded text-[#78839E] dark:text-[#7C87A3] hover:text-[#11162B] dark:hover:text-[#F3F5FA] transition-colors shrink-0 flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
                  title="Copy Voice ID"
                  aria-label="Copy Voice ID"
                >
                  {copiedId ? (
                    <Check className="w-3 h-3 text-[#16A34A] dark:text-[#22C55E]" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleFavoriteClick}
            className={`min-w-[34px] min-h-[34px] p-1.5 rounded-xl transition-colors shrink-0 flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 ${
              isFavorite
                ? 'text-[#DC2626] dark:text-[#F87171] bg-[#DC2626]/10'
                : 'text-[#78839E] dark:text-[#7C87A3] hover:text-[#11162B] dark:hover:text-[#F3F5FA] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E]'
            }`}
            aria-label={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
            title={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
          >
            <Heart className={`w-4 h-4 ${isFavorite ? 'fill-[#DC2626] dark:fill-[#F87171]' : ''}`} />
          </button>
        </div>

        {/* Clean Unboxed Metadata */}
        {metadataParts.length > 0 && (
          <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-[11.5px] text-[#5A6580] dark:text-[#A2ADC7] mb-2 capitalize">
            {metadataParts.map((part, index) => (
              <React.Fragment key={`meta-${index}-${part}`}>
                {index > 0 && (
                  <span className="text-[#CFD6E6] dark:text-[#2C364F]" aria-hidden="true">
                    ·
                  </span>
                )}
                <span className="font-medium">{part}</span>
              </React.Fragment>
            ))}
          </div>
        )}

        {voice.description ? (
          <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] line-clamp-2 leading-relaxed">
            {voice.description}
          </p>
        ) : voice.useCase ? (
          <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] line-clamp-2 leading-relaxed">
            Best for {voice.useCase}
          </p>
        ) : null}
      </div>

      {/* Bottom Action Footer */}
      <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-[#E4E7EF] dark:border-[#1E2638]">
        {hasPreview ? (
          <button
            type="button"
            onClick={handlePreviewClick}
            disabled={loading}
            className={`min-h-[34px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 ${
              playing
                ? 'bg-[#2E5BFF] dark:bg-[#4D74FF] text-white'
                : 'bg-[#F7F8FA] dark:bg-[#0D121D] text-[#11162B] dark:text-[#F3F5FA] hover:bg-[#EEF2FF] dark:hover:bg-[#171E2E] border border-[#E4E7EF] dark:border-[#1E2638]'
            }`}
            title={playing ? 'Pause preview' : 'Preview voice'}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2E5BFF] dark:text-[#7A9AFF]" />
            ) : playing ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current text-[#2E5BFF] dark:text-[#7A9AFF]" />
            )}
            <span>{loading ? 'Loading' : playing ? 'Playing' : 'Preview'}</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-[#78839E] dark:text-[#7C87A3] py-1.5 whitespace-nowrap">
            <VolumeX className="w-3.5 h-3.5 shrink-0" />
            <span>No preview</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleCardSelect}
          className={`min-h-[34px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 ${
            isSelected
              ? 'bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white'
              : 'bg-[#EEF2FF] dark:bg-[#4D74FF]/14 hover:bg-[#E0E7FF] dark:hover:bg-[#4D74FF]/22 text-[#2E5BFF] dark:text-[#7A9AFF]'
          }`}
        >
          {isSelected ? (
            <>
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Selected</span>
            </>
          ) : (
            <span>Select Voice</span>
          )}
        </button>
      </div>
    </div>
  );
};

export const VoiceCard = React.memo(VoiceCardComponent);
