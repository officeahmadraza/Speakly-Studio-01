import React, { useEffect, useState, useCallback } from 'react';
import { Search, ShieldCheck, Eye } from 'lucide-react';
import { adminApi } from '../api.js';
import { AdminAuditLogRecord } from '../types.js';
import { useToast } from '../../context/ToastContext.js';
import { Modal } from '../../components/ui/index.js';

export const AdminAuditLogsView: React.FC<{ globalSearch?: string }> = ({ globalSearch = '' }) => {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<AdminAuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(globalSearch);
  const [inspectLog, setInspectLog] = useState<AdminAuditLogRecord | null>(null);

  useEffect(() => {
    setQ(globalSearch);
  }, [globalSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getAuditLogs({ q: q.trim() });
      setLogs(res.logs);
    } catch (err: any) {
      showToast(err.message || 'Failed to load audit logs.', 'error');
    } finally {
      setLoading(false);
    }
  }, [q, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-[#EEF2FF]/70 dark:bg-[#101521] border border-[#2E5BFF]/20 dark:border-[#1E2638] text-xs">
        <div className="flex items-center gap-2 font-semibold text-[#11162B] dark:text-[#F3F5FA]">
          <ShieldCheck className="w-4 h-4 text-[#2E5BFF] dark:text-[#7A9AFF] shrink-0" />
          <span>Immutable Audit Trail — Append-only compliance ledger (cannot be edited or deleted)</span>
        </div>
        <span className="font-mono tabular-nums text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">
          {logs.length} entries shown
        </span>
      </div>

      <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-4">
        <div className="relative">
          <Search className="w-4 h-4 text-[#78839E] dark:text-[#7C87A3] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by admin email, action, or target ID..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E4E7EF] dark:border-[#1E2638] bg-[#F7F8FA] dark:bg-[#0D121D] text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">
                <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                <th className="py-2.5 px-4 font-semibold">Administrator</th>
                <th className="py-2.5 px-4 font-semibold">Action</th>
                <th className="py-2.5 px-4 font-semibold">Target</th>
                <th className="py-2.5 px-4 font-semibold">IP Address</th>
                <th className="py-2.5 px-4 font-semibold text-right">Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EF] dark:divide-[#1E2638]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#5A6580] dark:text-[#A2ADC7]">
                    Loading immutable audit logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#5A6580] dark:text-[#A2ADC7]">
                    No audit records found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#F2F4F8]/70 dark:hover:bg-[#171E2E]/60 transition-colors duration-150">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[11px] text-[#5A6580] dark:text-[#A2ADC7] whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-[#11162B] dark:text-[#F3F5FA]">{log.adminEmail}</div>
                      <div className="text-[10px] text-[#5A6580] dark:text-[#A2ADC7]">{log.adminRole}</div>
                    </td>
                    <td className="py-2.5 px-4 font-mono font-semibold text-[#2E5BFF] dark:text-[#7A9AFF]">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-[#11162B] dark:text-[#F3F5FA]">
                      {log.targetType}:{log.targetId}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">
                      {log.ipAddress}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setInspectLog(log)}
                        className="p-1.5 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
                        title="Inspect Before / After Values"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={Boolean(inspectLog)}
        onClose={() => setInspectLog(null)}
        title={inspectLog ? `Audit Event: ${inspectLog.action}` : ''}
        subtitle={inspectLog ? `${inspectLog.adminEmail} · ${new Date(inspectLog.createdAt).toLocaleString()}` : ''}
        maxWidthClass="max-w-2xl"
      >
        {inspectLog && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="font-display font-bold text-[#5A6580] dark:text-[#A2ADC7] mb-1.5">Previous Value</div>
              <pre className="p-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] font-mono text-[11px] overflow-auto max-h-64 text-[#11162B] dark:text-[#F3F5FA]">
                {JSON.stringify(inspectLog.previousValue ?? null, null, 2)}
              </pre>
            </div>
            <div>
              <div className="font-display font-bold text-[#16A34A] dark:text-[#22C55E] mb-1.5">New Value</div>
              <pre className="p-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] font-mono text-[11px] overflow-auto max-h-64 text-[#11162B] dark:text-[#F3F5FA]">
                {JSON.stringify(inspectLog.newValue ?? null, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
