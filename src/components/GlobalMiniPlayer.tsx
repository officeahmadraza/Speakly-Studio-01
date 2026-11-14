import React from 'react';
import { Play, Pause, Loader2, Volume2, VolumeX, X, RotateCcw } from 'lucide-react';
import { useAudioPlayer } from '../context/AudioPlayerContext.js';

function formatMiniTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const GlobalMiniPlayer: React.FC = () => {
  const {
    activeUrl,
    activeTrackMeta,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    volume,
    playbackRate,
    pause,
    resume,
    stop,
    seek,
    setVolume,
    setPlaybackRate,
  } = useAudioPlayer();

  if (!activeUrl) return null;

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const cycleRate = () => {
    const rates = [1.0, 1.25, 1.5, 0.75];
    const idx = rates.indexOf(playbackRate);
    setPlaybackRate(rates[(idx + 1) % rates.length]);
  };

  return (
    <div
      role="region"
      aria-label="Global audio transport bar"
      className="shrink-0 bg-white/95 dark:bg-[#101521]/95 backdrop-blur-md border-t border-[#E4E7EF] dark:border-[#1E2638] px-3 sm:px-6 py-2.5 z-20 animate-studio-enter"
    >
      <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-3 sm:gap-5">
        {/* Track Identity & Live Bars */}
        <div className="flex items-center gap-3 min-w-0 flex-1 sm:flex-initial sm:max-w-[260px]">
          <button
            type="button"
            onClick={() => (isPlaying ? pause() : resume())}
            disabled={isLoading}
            aria-label={isPlaying ? 'Pause audio' : 'Resume audio'}
            className="w-9 h-9 rounded-full bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white flex items-center justify-center shrink-0 transition-all active:scale-95 cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/50"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              {isPlaying && (
                <span className="inline-flex items-end gap-[2px] h-3 shrink-0" aria-hidden="true">
                  <span className="w-[2.5px] h-2.5 rounded-full bg-[#2E5BFF] dark:bg-[#4D74FF] animate-waveform-bar" style={{ animationDelay: '0ms' }} />
                  <span className="w-[2.5px] h-3 rounded-full bg-[#4D74FF] dark:bg-[#7A9AFF] animate-waveform-bar" style={{ animationDelay: '180ms' }} />
                  <span className="w-[2.5px] h-2 rounded-full bg-[#2E5BFF] dark:bg-[#4D74FF] animate-waveform-bar" style={{ animationDelay: '340ms' }} />
                </span>
              )}
              <span className="text-xs font-bold text-[#11162B] dark:text-[#F3F5FA] truncate">
                {activeTrackMeta?.title || 'Active Audio'}
              </span>
            </div>
            {activeTrackMeta?.subtitle && (
              <p className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] truncate">
                {activeTrackMeta.subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Interactive Scrubber */}
        <div className="hidden md:flex items-center gap-3 flex-1 max-w-xl">
          <span className="text-[11px] font-mono tabular-nums text-[#5A6580] dark:text-[#A2ADC7] w-10 text-right shrink-0">
            {formatMiniTime(currentTime)}
          </span>
          <div className="relative flex-1 h-5 flex items-center group">
            <div className="w-full h-1.5 rounded-full bg-[#E4E7EF] dark:bg-[#1E2638] overflow-hidden">
              <div
                className="h-full bg-[#2E5BFF] dark:bg-[#4D74FF] transition-[width] duration-75"
                style={{ width: `${progress}%` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={duration > 0 ? duration : 100}
              step={0.1}
              value={currentTime}
              disabled={duration <= 0}
              onChange={(e) => seek(parseFloat(e.target.value))}
              aria-label="Seek active audio"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
          </div>
          <span className="text-[11px] font-mono tabular-nums text-[#5A6580] dark:text-[#A2ADC7] w-10 shrink-0">
            {formatMiniTime(duration)}
          </span>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              seek(0);
              if (!isPlaying) resume();
            }}
            aria-label="Replay from start"
            title="Replay from start"
            className="hidden sm:flex w-8 h-8 rounded-lg text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-white hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={cycleRate}
            title="Toggle playback speed"
            className="h-8 px-2.5 rounded-lg border border-[#E4E7EF] dark:border-[#1E2638] bg-[#F7F8FA] dark:bg-[#0D121D] text-[11px] font-mono font-semibold text-[#11162B] dark:text-[#F3F5FA] hover:border-[#2E5BFF] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
          >
            {playbackRate.toFixed(2).replace(/\.00$/, '')}x
          </button>

          <div className="hidden lg:flex items-center gap-1.5 pl-1">
            <button
              type="button"
              onClick={() => setVolume(volume > 0 ? 0 : 1)}
              aria-label={volume === 0 ? 'Unmute' : 'Mute'}
              className="p-1.5 rounded-lg text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
            >
              {volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              aria-label="Global volume"
              className="w-16 studio-slider bg-[#E4E7EF] dark:bg-[#1E2638] accent-[#2E5BFF]"
            />
          </div>

          <button
            type="button"
            onClick={stop}
            aria-label="Close audio bar"
            title="Stop and close player"
            className="w-8 h-8 rounded-lg text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#DC2626] dark:hover:text-[#F87171] hover:bg-[#DC2626]/10 flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
