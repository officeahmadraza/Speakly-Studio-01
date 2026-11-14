import React, { useState, useMemo } from 'react';
import {
  History,
  Trash2,
  Mic,
  AlertTriangle,
  Search,
  Play,
  Pause,
  Copy,
  Check,
  X,
  LayoutList,
  Table2,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { GenerationHistoryItem } from '../types/index.js';
import { formatTranscriptAsTxt, getTrimmedCharCount } from '../../shared/creditPricing.js';
import { AudioPlayer } from '../components/AudioPlayer.js';
import { getDownloadUrl } from '../services/api.js';
import { useToast } from '../context/ToastContext.js';
import { useAudioPlayer } from '../context/AudioPlayerContext.js';
import { EmptyState } from '../components/ui/index.js';

interface HistoryViewProps {
  history: GenerationHistoryItem[];
  onRemoveItem: (id: string) => void;
  onClearHistory: () => void;
  onUseTextInCreate: (text: string, voiceId: string, speed?: number) => void;
}

const PAGE_SIZE = 10;

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  onRemoveItem,
  onClearHistory,
  onUseTextInCreate,
}) => {
  const { showToast } = useToast();
  const { playUrl, pause, activeUrl, isPlaying } = useAudioPlayer();

  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const filteredHistory = useMemo(() => {
    const now = Date.now();
    const q = searchTerm.trim().toLowerCase();

    const list = history.filter((item) => {
      if (dateFilter !== 'all') {
        const created = new Date(item.createdAt).getTime();
        const diffDays = (now - created) / (1000 * 60 * 60 * 24);
        if (dateFilter === 'today' && diffDays > 1) return false;
        if (dateFilter === '7d' && diffDays > 7) return false;
        if (dateFilter === '30d' && diffDays > 30) return false;
      }

      if (!q) return true;
      return (
        (item.fileName || '').toLowerCase().includes(q) ||
        item.voiceName.toLowerCase().includes(q) ||
        item.text.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sortOrder === 'newest' ? tb - ta : ta - tb;
    });
  }, [history, searchTerm, dateFilter, sortOrder]);

  const totalPages = Math.ceil(filteredHistory.length / PAGE_SIZE) || 1;
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredHistory.slice(start, start + PAGE_SIZE);
  }, [filteredHistory, page]);

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast('Script text copied to clipboard', 'info');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDurationEstimate = (item: GenerationHistoryItem) => {
    const secs =
      item.estimatedDurationSec ||
      Math.max(1, Math.round((item.wordCount / 145) * 60 / (item.speed || 1)));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleDownloadHistoryTranscript = (item: GenerationHistoryItem) => {
    if (!item.withTranscript || !item.transcriptData || !item.transcriptData.words?.length) return;
    const rawDisplayName = (item.fileName || item.voiceName || `speech_${item.taskId}`).trim();
    const safeSlug = rawDisplayName
      .replace(/[^a-zA-Z0-9_\-\s]/g, '_')
      .trim()
      .replace(/\s+/g, '_');
    const txtContent = formatTranscriptAsTxt({
      transcript: item.transcriptData,
      fileName: rawDisplayName,
      totalCharacters: getTrimmedCharCount(item.text) || item.charCount,
    });
    const filename = `${safeSlug || 'speech'}_transcript.txt`;
    const blob = new Blob([txtContent], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast(`Transcript downloaded (${filename})`, 'success');
  };

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#11162B] dark:text-[#F3F5FA]">
            History
          </h1>
          <p className="text-xs sm:text-sm text-[#5A6580] dark:text-[#A2ADC7] mt-0.5">
            Play back, download, reuse, or manage your synthesized audio recordings.
          </p>
        </div>

        {history.length > 0 && (
          <button
            type="button"
            onClick={onClearHistory}
            className="h-9 px-4 rounded-xl bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] hover:border-[#DC2626]/50 hover:text-[#DC2626] dark:hover:text-[#F87171] text-xs font-semibold text-[#5A6580] dark:text-[#A2ADC7] transition-colors flex items-center gap-2 self-start whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/30"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {/* Archiving Note */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-[#D97706]/8 border border-[#D97706]/25 text-xs text-[#9A630E] dark:text-[#F59E0B]">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="font-semibold">Audio asset archiving:</strong> Script text and generation metadata are persisted in your workspace. Upstream streaming links expire over time—download MP3 or WAV files to keep permanent copies.
        </div>
      </div>

      {history.length === 0 ? (
        <EmptyState
          icon={<History className="w-6 h-6" />}
          title="No generation history yet"
          description="Your synthesized speech tracks will appear here with inline playback, verified downloads, and script reuse."
        />
      ) : (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#78839E] dark:text-[#7C87A3] pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by file name, voice actor, or script..."
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

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value as 'all' | 'today' | '7d' | '30d');
                  setPage(1);
                }}
                aria-label="Filter by date"
                className="h-10 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl px-3 text-xs text-[#11162B] dark:text-[#F3F5FA] font-medium focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] cursor-pointer"
              >
                <option value="all">All Dates</option>
                <option value="today">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>

              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
                aria-label="Sort history"
                className="h-10 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl px-3 text-xs text-[#11162B] dark:text-[#F3F5FA] font-medium focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] cursor-pointer"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </select>

              <div className="flex items-center p-1 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl h-10">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    viewMode === 'table'
                      ? 'bg-white dark:bg-[#171E2E] text-[#2E5BFF] dark:text-[#7A9AFF]'
                      : 'text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA]'
                  }`}
                  title="Table View"
                  aria-label="Table View"
                >
                  <Table2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    viewMode === 'cards'
                      ? 'bg-white dark:bg-[#171E2E] text-[#2E5BFF] dark:text-[#7A9AFF]'
                      : 'text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA]'
                  }`}
                  title="Card View"
                  aria-label="Card View"
                >
                  <LayoutList className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {paginatedItems.length === 0 ? (
            <EmptyState
              icon={<Search className="w-5 h-5" />}
              title="No matching history records"
              description="Adjust your search query or date filter to locate past recordings."
              action={
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setDateFilter('all');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors"
                >
                  Reset Filters
                </button>
              }
            />
          ) : viewMode === 'table' ? (
            <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E4E7EF] dark:border-[#1E2638] bg-[#F7F8FA] dark:bg-[#0D121D] text-[11px] font-semibold text-[#5A6580] dark:text-[#A2ADC7]">
                      <th className="py-2.5 px-4">Recording</th>
                      <th className="py-2.5 px-4">Voice Actor</th>
                      <th className="py-2.5 px-4 text-right">Duration</th>
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E7EF] dark:divide-[#1E2638] text-xs">
                    {paginatedItems.map((item) => {
                      const isExpanded = expandedItemId === item.id;
                      const playingThis = Boolean(item.audioUrl && activeUrl === item.audioUrl && isPlaying);
                      const trackTitle = item.fileName || `${item.voiceName} Narration`;

                      return (
                        <React.Fragment key={item.id}>
                          <tr
                            className={`transition-colors ${
                              playingThis
                                ? 'bg-[#EEF2FF]/55 dark:bg-[#4D74FF]/10'
                                : 'hover:bg-[#F7F8FA] dark:hover:bg-[#171E2E]/60'
                            }`}
                          >
                            <td className="py-2.5 px-4 max-w-[280px]">
                              <div className="flex items-center gap-2">
                                {playingThis && (
                                  <span
                                    className="inline-flex items-end gap-[2px] h-3 shrink-0 text-[#2E5BFF] dark:text-[#7A9AFF]"
                                    aria-hidden="true"
                                  >
                                    <span className="w-[2px] rounded-full bg-current animate-waveform-bar" style={{ animationDelay: '0ms' }} />
                                    <span className="w-[2px] rounded-full bg-current animate-waveform-bar" style={{ animationDelay: '180ms' }} />
                                    <span className="w-[2px] rounded-full bg-current animate-waveform-bar" style={{ animationDelay: '340ms' }} />
                                  </span>
                                )}
                                <span className="font-semibold text-[#11162B] dark:text-[#F3F5FA] truncate">
                                  {trackTitle}
                                </span>
                              </div>
                              <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] truncate mt-0.5">
                                {item.text}
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-[#11162B] dark:text-[#F3F5FA] font-medium whitespace-nowrap">
                              {item.voiceName}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#5A6580] dark:text-[#A2ADC7] whitespace-nowrap">
                              ~{formatDurationEstimate(item)}
                            </td>
                            <td className="py-2.5 px-4 font-mono tabular-nums text-[#5A6580] dark:text-[#A2ADC7] whitespace-nowrap">
                              {new Date(item.createdAt).toLocaleDateString()}
                            </td>
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#16A34A] dark:text-[#22C55E]">
                                <Check className="w-3.5 h-3.5" />
                                <span>Completed</span>
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                {item.audioUrl && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (playingThis) {
                                        pause();
                                      } else {
                                        playUrl(item.audioUrl!, item.id, {
                                          title: trackTitle,
                                          subtitle: item.voiceName,
                                          voiceName: item.voiceName,
                                        });
                                      }
                                      setExpandedItemId(isExpanded ? null : item.id);
                                    }}
                                    className={`px-2.5 py-1.5 rounded-lg font-semibold text-[11px] inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                                      playingThis
                                        ? 'bg-[#2E5BFF] dark:bg-[#4D74FF] text-white'
                                        : 'bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] hover:bg-[#2E5BFF] hover:text-white dark:hover:bg-[#4D74FF] dark:hover:text-white'
                                    }`}
                                  >
                                    {playingThis ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                                    <span>{isExpanded ? 'Hide Player' : playingThis ? 'Pause' : 'Play'}</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => onUseTextInCreate(item.text, item.voiceId, item.speed)}
                                  className="p-1.5 rounded-lg text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#2E5BFF] dark:hover:text-[#7A9AFF] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] transition-colors cursor-pointer"
                                  title="Load script & voice in Create Speech"
                                  aria-label="Load script & voice in Create Speech"
                                >
                                  <Mic className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopyText(item.text, item.id)}
                                  className="p-1.5 rounded-lg text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] transition-colors cursor-pointer"
                                  title="Copy script"
                                  aria-label="Copy script"
                                >
                                  {copiedId === item.id ? (
                                    <Check className="w-3.5 h-3.5 text-[#16A34A] dark:text-[#22C55E]" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRemoveItem(item.id)}
                                  className="p-1.5 rounded-lg text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#DC2626] dark:hover:text-[#F87171] transition-colors cursor-pointer"
                                  title="Delete recording"
                                  aria-label="Delete recording"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && item.audioUrl && (
                            <tr>
                              <td colSpan={6} className="p-4 bg-[#F7F8FA] dark:bg-[#0D121D] space-y-3">
                                <AudioPlayer
                                  audioUrl={item.audioUrl}
                                  title={trackTitle}
                                  voiceName={item.voiceName}
                                  createdAt={item.createdAt}
                                  downloadUrl={getDownloadUrl(
                                    item.taskId,
                                    item.fileName || 'Voice',
                                    item.audioUrl
                                  )}
                                  downloadFileName={item.fileName || 'Voice'}
                                  onRegenerate={() =>
                                    onUseTextInCreate(item.text, item.voiceId, item.speed)
                                  }
                                  onDelete={() => onRemoveItem(item.id)}
                                />
                                {item.withTranscript && item.transcriptData && item.transcriptData.words?.length > 0 && (
                                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-[#E4E7EF] dark:border-[#1E2638]">
                                    <span className="text-xs text-[#5A6580] dark:text-[#A2ADC7] font-mono tabular-nums">
                                      Word-Aligned Transcript · {item.transcriptData.wordCount.toLocaleString()} words · TXT
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadHistoryTranscript(item)}
                                      className="h-8 px-3 rounded-lg bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] hover:bg-[#2E5BFF] hover:text-white dark:hover:bg-[#4D74FF] dark:hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                                    >
                                      <FileText className="w-3.5 h-3.5" />
                                      <span>Download Transcript (.txt)</span>
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {paginatedItems.map((item) => {
                const trackTitle = item.fileName || `${item.voiceName} Narration`;
                return (
                  <div
                    key={item.id}
                    className="p-5 rounded-2xl bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="font-display text-sm font-bold text-[#11162B] dark:text-[#F3F5FA]">
                          {trackTitle}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#5A6580] dark:text-[#A2ADC7] font-mono tabular-nums mt-1">
                          <span>{item.voiceName}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.wordCount} words</span>
                          <span aria-hidden="true">·</span>
                          <span>~{formatDurationEstimate(item)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onUseTextInCreate(item.text, item.voiceId, item.speed)}
                          className="h-8 px-3 rounded-xl bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] hover:bg-[#2E5BFF] hover:text-white dark:hover:bg-[#4D74FF] dark:hover:text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                        >
                          <Mic className="w-3.5 h-3.5" />
                          <span>Reuse Script</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.id)}
                          className="p-2 rounded-xl text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#DC2626] dark:hover:text-[#F87171] transition-colors cursor-pointer"
                          aria-label="Delete recording"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] bg-[#F7F8FA] dark:bg-[#0D121D] p-3.5 rounded-xl line-clamp-3 leading-relaxed">
                      {item.text}
                    </p>

                    {item.audioUrl && (
                      <AudioPlayer
                        audioUrl={item.audioUrl}
                        title={trackTitle}
                        voiceName={item.voiceName}
                        createdAt={item.createdAt}
                        downloadUrl={getDownloadUrl(item.taskId, item.fileName || 'Voice', item.audioUrl)}
                        downloadFileName={item.fileName || 'Voice'}
                        onRegenerate={() => onUseTextInCreate(item.text, item.voiceId, item.speed)}
                        onDelete={() => onRemoveItem(item.id)}
                      />
                    )}
                    {item.withTranscript && item.transcriptData && item.transcriptData.words?.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#E4E7EF] dark:border-[#1E2638]">
                        <span className="text-xs text-[#5A6580] dark:text-[#A2ADC7] font-mono tabular-nums">
                          Word-Aligned Transcript · {item.transcriptData.wordCount.toLocaleString()} words · TXT
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDownloadHistoryTranscript(item)}
                          className="h-8 px-3 rounded-lg bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] hover:bg-[#2E5BFF] hover:text-white dark:hover:bg-[#4D74FF] dark:hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Download Transcript (.txt)</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 text-xs text-[#5A6580] dark:text-[#A2ADC7]">
              <span className="font-mono tabular-nums">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredHistory.length)} of{' '}
                {filteredHistory.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-9 px-3 rounded-xl border border-[#E4E7EF] dark:border-[#1E2638] bg-white dark:bg-[#101521] hover:border-[#2E5BFF] text-[#11162B] dark:text-[#F3F5FA] disabled:opacity-40 cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Prev</span>
                </button>
                <span className="font-mono tabular-nums font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-9 px-3 rounded-xl border border-[#E4E7EF] dark:border-[#1E2638] bg-white dark:bg-[#101521] hover:border-[#2E5BFF] text-[#11162B] dark:text-[#F3F5FA] disabled:opacity-40 cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
