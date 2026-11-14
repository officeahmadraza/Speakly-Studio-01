import React, { useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Download,
  Loader2,
  RefreshCw,
  Trash2,
  Link2,
  Check,
} from 'lucide-react';
import { useAudioPlayer } from '../context/AudioPlayerContext.js';
import { useToast } from '../context/ToastContext.js';

interface AudioPlayerProps {
  audioUrl: string;
  title?: string;
  subtitle?: string;
  voiceName?: string;
  formatLabel?: string;
  createdAt?: string;
  onDownload?: () => void;
  onRegenerate?: () => void;
  onDelete?: () => void;
  downloadUrl?: string;
  downloadFileName?: string;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

const WAVEFORM_HEIGHTS = [
  28, 42, 65, 30, 80, 52, 90, 70, 40, 60, 95, 82, 45, 68, 75, 55, 88, 62, 35,
  72, 85, 48, 92, 78, 64, 40, 80, 58, 90, 72, 50, 68, 84, 42, 70, 60, 48, 76,
  35, 25,
];

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  title,
  subtitle,
  voiceName,
  formatLabel = 'MP3',
  createdAt,
  onDownload,
  onRegenerate,
  onDelete,
  downloadUrl,
  downloadFileName,
}) => {
  const {
    activeUrl,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    volume,
    playbackRate,
    playUrl,
    pause,
    resume,
    seek,
    setVolume,
    setPlaybackRate,
  } = useAudioPlayer();

  const { showToast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);

  const isCurrentAudio = activeUrl === audioUrl;
  const effectivelyPlaying = isCurrentAudio && isPlaying;
  const effectivelyLoading = isCurrentAudio && isLoading;
  const currentDuration = isCurrentAudio && duration > 0 ? duration : 0;
  const currentPos = isCurrentAudio ? currentTime : 0;
  const progressRatio = currentDuration > 0 ? currentPos / currentDuration : 0;

  const trackMeta = {
    title: title || 'Generated Audio Track',
    subtitle: voiceName ? `${voiceName} · ${formatLabel}` : formatLabel,
    voiceName,
  };

  const isShareableUrl =
    Boolean(audioUrl) &&
    (audioUrl.startsWith('http://') || audioUrl.startsWith('https://'));

  const handlePlayToggle = () => {
    if (!isCurrentAudio) {
      playUrl(audioUrl, undefined, trackMeta);
    } else if (isPlaying) {
      pause();
    } else {
      resume();
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (!isCurrentAudio) {
      playUrl(audioUrl, undefined, trackMeta).then(() => seek(newTime));
    } else {
      seek(newTime);
    }
  };

  const handleRestart = () => {
    if (isCurrentAudio) {
      seek(0);
      if (!isPlaying) resume();
    } else {
      playUrl(audioUrl, undefined, trackMeta);
    }
  };

  const handleVolumeToggle = () => {
    setVolume(volume > 0 ? 0 : 1);
  };

  const cyclePlaybackRate = () => {
    const rates = [1.0, 1.25, 1.5, 0.75];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    setPlaybackRate(nextRate);
  };

  const handleCopyShareLink = () => {
    if (!isShareableUrl) return;
    navigator.clipboard.writeText(audioUrl);
    setCopiedLink(true);
    showToast('Audio URL copied to clipboard', 'info');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleDownloadAudio = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isDownloading) return;

    setIsDownloading(true);
    try {
      let targetUrl = downloadUrl;
      if (!targetUrl && audioUrl) {
        targetUrl = `/api/download?url=${encodeURIComponent(audioUrl)}&filename=${encodeURIComponent(
          downloadFileName?.trim() || 'Voice'
        )}`;
      } else if (targetUrl && audioUrl && !targetUrl.includes('url=')) {
        const separator = targetUrl.includes('?') ? '&' : '?';
        targetUrl = `${targetUrl}${separator}url=${encodeURIComponent(audioUrl)}`;
      }

      let blob: Blob | null = null;
      let lastErrorMessage = '';

      if (targetUrl) {
        try {
          const res = await fetch(targetUrl);
          if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
              const json = await res.json();
              lastErrorMessage = json.error || json.message || 'Server returned invalid audio stream';
            } else {
              blob = await res.blob();
            }
          } else {
            const errText = await res.text();
            try {
              const parsed = JSON.parse(errText);
              lastErrorMessage = parsed.error || parsed.message || `Server error (${res.status})`;
            } catch {
              lastErrorMessage = errText.slice(0, 150) || `Server error (${res.status})`;
            }
          }
        } catch (fetchErr: any) {
          lastErrorMessage = fetchErr.message || 'Network error downloading stream';
        }
      }

      if ((!blob || blob.size === 0) && audioUrl) {
        try {
          const directRes = await fetch(audioUrl);
          if (directRes.ok) {
            const contentType = (directRes.headers.get('content-type') || '').toLowerCase();
            if (!contentType.includes('application/json')) {
              blob = await directRes.blob();
            }
          }
        } catch {
          // CORS fallback ignored
        }
      }

      if (!blob || blob.size === 0) {
        throw new Error(
          lastErrorMessage || 'Audio stream could not be retrieved from source. Please generate a new speech sample.'
        );
      }

      const headerBytes = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
      if (headerBytes[0] === 0x7b || (headerBytes[0] === 0x3c && headerBytes[1] === 0x21)) {
        throw new Error('Audio file payload contains an upstream error instead of valid audio frames.');
      }

      let detectedExt = 'mp3';
      if (
        headerBytes.length >= 12 &&
        headerBytes[0] === 0x52 &&
        headerBytes[1] === 0x49 &&
        headerBytes[2] === 0x46 &&
        headerBytes[3] === 0x46 &&
        headerBytes[8] === 0x57 &&
        headerBytes[9] === 0x41 &&
        headerBytes[10] === 0x56 &&
        headerBytes[11] === 0x45
      ) {
        detectedExt = 'wav';
      } else if (
        headerBytes.length >= 4 &&
        headerBytes[0] === 0x4f &&
        headerBytes[1] === 0x67 &&
        headerBytes[2] === 0x67 &&
        headerBytes[3] === 0x53
      ) {
        detectedExt = 'ogg';
      }

      let baseName = (downloadFileName?.trim() || 'Voice')
        .replace(/\.(mp3|wav|ogg|aac|m4a|bin|json)$/i, '')
        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
        .trim();
      if (!baseName) baseName = 'Voice';
      const finalFileName = `${baseName}.${detectedExt}`;

      const blobUrl = URL.createObjectURL(blob);
      const tempLink = document.createElement('a');
      tempLink.href = blobUrl;
      tempLink.download = finalFileName;
      tempLink.style.display = 'none';
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);

      if (onDownload) onDownload();
      showToast(`Audio downloaded (${finalFileName})`, 'success');
    } catch (err: any) {
      console.error('Download error:', err);
      showToast(err.message || 'Failed to download audio file.', 'error', 'Download Issue');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="w-full bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-4 sm:p-5 transition-all">
      {/* Track Details & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-[#E4E7EF] dark:border-[#1E2638]">
        <div className="min-w-0 flex-1">
          <h4 className="font-display text-sm font-bold text-[#11162B] dark:text-[#F3F5FA] truncate">
            {title || 'Generated Audio Track'}
          </h4>
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-[#5A6580] dark:text-[#A2ADC7] mt-1">
            {voiceName && <span className="font-semibold text-[#2E5BFF] dark:text-[#7A9AFF]">{voiceName}</span>}
            {voiceName && <span aria-hidden="true">·</span>}
            <span className="font-mono uppercase">{formatLabel}</span>
            {currentDuration > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{formatTime(currentDuration)}</span>
              </>
            )}
            {(createdAt || subtitle) && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{subtitle || new Date(createdAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {isShareableUrl && (
            <button
              type="button"
              onClick={handleCopyShareLink}
              className="h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] hover:border-[#2E5BFF] text-xs font-semibold text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
              title="Copy shareable audio URL"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-[#16A34A] dark:text-[#22C55E]" /> : <Link2 className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">{copiedLink ? 'Copied' : 'Copy Link'}</span>
            </button>
          )}

          {onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              className="h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] hover:border-[#2E5BFF] text-xs font-semibold text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
              title="Regenerate audio with current settings"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Regenerate</span>
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="h-9 w-9 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] hover:border-[#DC2626]/40 hover:text-[#DC2626] dark:hover:text-[#F87171] text-[#5A6580] dark:text-[#A2ADC7] transition-colors flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
              title="Delete audio item"
              aria-label="Delete audio item"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {(downloadUrl || audioUrl) && (
            <button
              type="button"
              onClick={handleDownloadAudio}
              disabled={isDownloading}
              className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 rounded-xl text-xs font-semibold text-white bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] transition-colors shrink-0 cursor-pointer disabled:opacity-60 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/50"
              title="Download verified audio file"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Downloading...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Acoustic Waveform Scrub Section */}
      <div className="py-3.5 space-y-2">
        <div
          className="relative group py-1.5"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setHoverRatio(ratio);
          }}
          onMouseLeave={() => setHoverRatio(null)}
        >
          {hoverRatio !== null && currentDuration > 0 && (
            <div
              className="pointer-events-none absolute -top-5 -translate-x-1/2 px-1.5 py-0.5 rounded bg-[#11162B] dark:bg-[#F3F5FA] text-white dark:text-[#11162B] text-[10px] font-mono tabular-nums shadow-xs z-10"
              style={{ left: `${hoverRatio * 100}%` }}
            >
              {formatTime(hoverRatio * currentDuration)}
            </div>
          )}

          <div className="h-12 flex items-center justify-between gap-[3px] sm:gap-[4px] px-1 pointer-events-none select-none">
            {WAVEFORM_HEIGHTS.map((heightPercent, idx) => {
              const barRatio = idx / WAVEFORM_HEIGHTS.length;
              const isPlayed = progressRatio >= barRatio;
              const isHovered = hoverRatio !== null && hoverRatio >= barRatio;

              return (
                <div
                  key={idx}
                  className={`flex-1 rounded-full transition-colors duration-100 ${
                    isPlayed
                      ? 'bg-[#2E5BFF] dark:bg-[#4D74FF]'
                      : isHovered
                      ? 'bg-[#2E5BFF]/35 dark:bg-[#4D74FF]/40'
                      : 'bg-[#E4E7EF] dark:bg-[#1E2638]'
                  }`}
                  style={{ height: `${heightPercent}%` }}
                />
              );
            })}
          </div>

          <input
            type="range"
            min={0}
            max={currentDuration > 0 ? currentDuration : 100}
            step={0.1}
            value={currentPos}
            onChange={handleSeekChange}
            disabled={!isCurrentAudio && !currentDuration}
            aria-label="Seek timeline scrub bar"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#5A6580] dark:text-[#A2ADC7]">
          <span>{formatTime(currentPos)}</span>
          <span>{formatTime(currentDuration)}</span>
        </div>
      </div>

      {/* Studio Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#E4E7EF] dark:border-[#1E2638]">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handlePlayToggle}
            aria-label={effectivelyPlaying ? 'Pause audio' : 'Play audio'}
            disabled={effectivelyLoading}
            className="w-10 h-10 rounded-full bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/50"
          >
            {effectivelyLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : effectivelyPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={handleRestart}
            aria-label="Replay from start"
            className="p-2 rounded-xl text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-white hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
            title="Replay from beginning"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={cyclePlaybackRate}
            aria-label={`Playback speed: ${playbackRate}x`}
            className="h-8 px-2.5 rounded-lg text-xs font-mono tabular-nums font-semibold text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-white hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] border border-[#E4E7EF] dark:border-[#1E2638] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
            title="Toggle playback speed"
          >
            {playbackRate.toFixed(2).replace(/\.00$/, '')}x
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleVolumeToggle}
            aria-label={volume === 0 ? 'Unmute' : 'Mute'}
            className="p-1.5 rounded-lg text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
          >
            {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            aria-label="Volume slider"
            className="studio-slider w-16 sm:w-24 h-1.5 bg-[#E4E7EF] dark:bg-[#1E2638] rounded-lg appearance-none cursor-pointer focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
};
