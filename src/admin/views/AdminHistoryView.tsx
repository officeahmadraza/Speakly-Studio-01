import React, { useEffect, useState, useCallback } from 'react';
import { Search, Play, Pause, AlertCircle, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { adminApi } from '../api.js';
import { AdminSpeechRecord } from '../types.js';
import { useToast } from '../../context/ToastContext.js';
import { Modal } from '../../components/ui/index.js';

export const AdminHistoryView: React.FC<{ globalSearch?: string }> = ({ globalSearch = '' }) => {
  const { showToast } = useToast();
  const [history, setHistory] = useState<AdminSpeechRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(globalSearch);
  const [statusFilter, setStatusFilter] = useState('all');

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [inspectItem, setInspectItem] = useState<AdminSpeechRecord | null>(null);

  useEffect(() => {
    setQ(globalSearch);
  }, [globalSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getSpeechHistory(q.trim(), statusFilter);
      setHistory(res.history);
    } catch (err: any) {
      showToast(err.message || 'Failed to load speech history.', 'error');
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      audioEl?.pause();
    };
  }, [audioEl]);

  const togglePlay = (item: AdminSpeechRecord) => {
    if (!item.audioUrl) return;
    if (playingId === item.id && audioEl) {
      audioEl.pause();
      setPlayingId(null);
      return;
    }
    audioEl?.pause();
    const proxyUrl = `/api/audio-proxy?url=${encodeURIComponent(item.audioUrl)}`;
    const nextAudio = new Audio(proxyUrl);
    nextAudio.onended = () => setPlayingId(null);
    nextAudio.onerror = () => {
      setPlayingId(null);
      showToast('Upstream audio URL has expired or is unavailable.', 'warning');
    };
    void nextAudio.play();
    setAudioEl(nextAudio);
    setPlayingId(item.id);
  };

  const handleDelete = async (id: string) => {
    try {
      await adminApi.deleteSpeechHistory(id);
      showToast('Speech generation record removed.', 'info');
      await load();
    } catch (err: any) {
      showToast(err.message || 'Failed to remove record.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#78839E] dark:text-[#7C87A3] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by task ID, voice, user email, or script text..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
        >
          <option value="all">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E4E7EF] dark:border-[#1E2638] bg-[#F7F8FA] dark:bg-[#0D121D] text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">
                <th className="py-2.5 px-4 font-semibold">Task & Date</th>
                <th className="py-2.5 px-4 font-semibold">User</th>
                <th className="py-2.5 px-4 font-semibold">Voice & Script</th>
                <th className="py-2.5 px-4 font-semibold">Params / Duration</th>
                <th className="py-2.5 px-4 font-semibold text-right">Credits</th>
                <th className="py-2.5 px-4 font-semibold">Status</th>
                <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EF] dark:divide-[#1E2638]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#5A6580] dark:text-[#A2ADC7]">
                    Loading speech generation logs...
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#5A6580] dark:text-[#A2ADC7]">
                    No speech generations recorded yet.
                  </td>
                </tr>
              ) : (
                history.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F2F4F8]/70 dark:hover:bg-[#171E2E]/60 transition-colors duration-150">
                    <td className="py-2.5 px-4">
                      <div className="font-mono text-[11px] font-semibold text-[#11162B] dark:text-[#F3F5FA]">{item.taskId}</div>
                      <div className="font-mono tabular-nums text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">
                        {new Date(item.createdAt).toLocaleString()}
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-[#11162B] dark:text-[#F3F5FA]">{item.userName || item.userId}</div>
                      <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">{item.userEmail || 'Guest'}</div>
                    </td>
                    <td className="py-2.5 px-4 max-w-xs">
                      <div className="font-semibold text-[#2E5BFF] dark:text-[#7A9AFF]">{item.voiceName}</div>
                      <button
                        type="button"
                        onClick={() => setInspectItem(item)}
                        className="text-left text-[11px] text-[#5A6580] dark:text-[#A2ADC7] line-clamp-2 hover:underline cursor-pointer"
                      >
                        {item.text}
                      </button>
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">
                      <div>{item.speed}x · {item.charCount} ch</div>
                      <div>~{item.estimatedDurationSec}s</div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-[#11162B] dark:text-[#F3F5FA]">
                      {item.creditCost}
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold capitalize ${
                          item.status === 'completed'
                            ? 'text-[#16A34A] dark:text-[#22C55E]'
                            : 'text-[#DC2626] dark:text-[#F87171]'
                        }`}
                      >
                        {item.status === 'completed' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{item.status}</span>
                      </span>
                      {item.errorMessage && (
                        <div className="text-[10px] text-[#DC2626] dark:text-[#F87171] mt-0.5 max-w-[160px] truncate">
                          {item.errorMessage}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        {item.audioUrl && (
                          <button
                            type="button"
                            onClick={() => togglePlay(item)}
                            title="Play Audio"
                            className="p-1.5 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
                          >
                            {playingId === item.id ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setInspectItem(item)}
                          title="Inspect Details"
                          className="p-1.5 rounded-lg hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] text-[#5A6580] dark:text-[#A2ADC7] cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
                        >
                          <AlertCircle className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          title="Remove Record"
                          className="p-1.5 rounded-lg hover:bg-[#DC2626]/12 text-[#DC2626] dark:text-[#F87171] cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]/40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={Boolean(inspectItem)}
        onClose={() => setInspectItem(null)}
        title="Speech Generation Inspection"
        subtitle={inspectItem ? `Task ID: ${inspectItem.taskId}` : ''}
        maxWidthClass="max-w-xl"
      >
        {inspectItem && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] font-mono tabular-nums text-[11px] text-[#11162B] dark:text-[#F3F5FA]">
              <div>Voice: {inspectItem.voiceName}</div>
              <div>Speed: {inspectItem.speed}x</div>
              <div>Words: {inspectItem.wordCount}</div>
              <div>Credits: {inspectItem.creditCost}</div>
              <div>Transcript: {inspectItem.withTranscript ? 'Yes' : 'No'}</div>
              <div>Status: {inspectItem.status}</div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] max-h-56 overflow-y-auto whitespace-pre-wrap leading-relaxed text-[#11162B] dark:text-[#F3F5FA]">
              {inspectItem.text}
            </div>
            {inspectItem.errorMessage && (
              <div className="p-3 rounded-xl bg-[#DC2626]/10 text-[#DC2626] dark:text-[#F87171]">
                Error: {inspectItem.errorMessage}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
