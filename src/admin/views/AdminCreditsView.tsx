import React, { useEffect, useState, useCallback } from 'react';
import { Coins, Plus, Search, Loader2 } from 'lucide-react';
import { adminApi } from '../api.js';
import { AdminCreditTransaction, AdminUserRecord } from '../types.js';
import { useToast } from '../../context/ToastContext.js';
import { Modal } from '../../components/ui/index.js';

export const AdminCreditsView: React.FC<{ globalSearch?: string }> = ({ globalSearch = '' }) => {
  const { showToast } = useToast();
  const [transactions, setTransactions] = useState<AdminCreditTransaction[]>([]);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [summary, setSummary] = useState({
    totalPurchased: 0,
    totalConsumed: 0,
    totalRemaining: 0,
    welcomeCreditsDistributed: 0,
    welcomeBonusCount: 0,
  });
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState(globalSearch);
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Manual Adjust Modal
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState('');
  const [mode, setMode] = useState<'add' | 'deduct' | 'set'>('add');
  const [amount, setAmount] = useState('1000');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setQ(globalSearch);
  }, [globalSearch]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [txRes, uRes] = await Promise.all([
        adminApi.getCreditTransactions({ q: q.trim(), type: typeFilter, dateFrom, dateTo }),
        adminApi.getUsers(),
      ]);
      setTransactions(txRes.transactions);
      setSummary(txRes.summary);
      setUsers(uRes.users);
      if (!targetUserId && uRes.users.length > 0) {
        setTargetUserId(uRes.users[0].uid);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load credit ledger.', 'error');
    } finally {
      setLoading(false);
    }
  }, [q, typeFilter, dateFrom, dateTo, showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUserId || !reason.trim()) {
      showToast('Select a user and enter an audit reason.', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      await adminApi.adjustCredits({
        userId: targetUserId,
        mode,
        amount: Number(amount),
        reason: reason.trim(),
        note: note.trim() || undefined,
      });
      showToast('Credit adjustment recorded atomically.', 'success');
      setIsAdjustOpen(false);
      setReason('');
      setNote('');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to adjust credits.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-4">
          <div className="text-xs font-medium text-[#5A6580] dark:text-[#A2ADC7]">Total Credits Purchased</div>
          <div className="font-display text-2xl font-bold font-mono tabular-nums text-[#16A34A] dark:text-[#22C55E] mt-1">
            {summary.totalPurchased.toLocaleString()}
          </div>
        </div>
        <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-4">
          <div className="text-xs font-medium text-[#5A6580] dark:text-[#A2ADC7]">Welcome Credits Distributed</div>
          <div className="font-display text-2xl font-bold font-mono tabular-nums text-[#2E5BFF] dark:text-[#7A9AFF] mt-1">
            {(summary.welcomeCreditsDistributed || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] mt-0.5 tabular-nums">
            {(summary.welcomeBonusCount || 0).toLocaleString()} verified Google accounts
          </div>
        </div>
        <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-4">
          <div className="text-xs font-medium text-[#5A6580] dark:text-[#A2ADC7]">Total Credits Consumed</div>
          <div className="font-display text-2xl font-bold font-mono tabular-nums text-[#11162B] dark:text-[#F3F5FA] mt-1">
            {summary.totalConsumed.toLocaleString()}
          </div>
        </div>
        <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-4 flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium text-[#5A6580] dark:text-[#A2ADC7]">Remaining User Credits</div>
            <div className="font-display text-2xl font-bold font-mono tabular-nums text-[#2E5BFF] dark:text-[#7A9AFF] mt-1">
              {summary.totalRemaining.toLocaleString()}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAdjustOpen(true)}
            className="h-9 px-3.5 rounded-lg bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adjust</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-[#78839E] dark:text-[#7C87A3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by user email, ID, or reason..."
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 px-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
        >
          <option value="all">All Types</option>
          <option value="signup_bonus">Google Welcome Bonus</option>
          <option value="initial_grant">Initial Grant</option>
          <option value="purchase">Purchase</option>
          <option value="consumption">Consumption</option>
          <option value="manual_add">Manual Add</option>
          <option value="manual_deduct">Manual Deduct</option>
          <option value="balance_override">Balance Override</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-9 px-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-9 px-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
        />
      </div>

      {/* Ledger Table */}
      <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E4E7EF] dark:border-[#1E2638] bg-[#F7F8FA] dark:bg-[#0D121D] text-[11px] font-semibold text-[#5A6580] dark:text-[#A2ADC7]">
                <th className="py-2.5 px-4">Timestamp</th>
                <th className="py-2.5 px-4">User</th>
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4">Reason / Admin Note</th>
                <th className="py-2.5 px-4 text-right">Previous</th>
                <th className="py-2.5 px-4 text-right">Delta</th>
                <th className="py-2.5 px-4 text-right">New Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EF] dark:divide-[#1E2638]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#5A6580] dark:text-[#A2ADC7]">
                    Loading credit ledger...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#5A6580] dark:text-[#A2ADC7]">
                    No credit transactions recorded yet.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[#F7F8FA] dark:hover:bg-[#171E2E]/60 transition-colors">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[11px] text-[#5A6580] dark:text-[#A2ADC7] whitespace-nowrap">
                      {new Date(tx.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-[#11162B] dark:text-[#F3F5FA]">{tx.userName || tx.userId}</div>
                      <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">{tx.userEmail}</div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">{tx.type}</td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-[#11162B] dark:text-[#F3F5FA]">{tx.reason}</div>
                      {tx.note && <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">{tx.note}</div>}
                      {tx.googleSub && (
                        <div className="text-[10px] font-mono text-[#5A6580] dark:text-[#A2ADC7]">Google Sub: {tx.googleSub}</div>
                      )}
                      {tx.adminEmail && (
                        <div className="text-[10px] text-[#2E5BFF] dark:text-[#7A9AFF]">By: {tx.adminEmail}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#5A6580] dark:text-[#A2ADC7]">
                      {tx.previousBalance.toLocaleString()}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold ${
                        tx.amount >= 0 ? 'text-[#16A34A] dark:text-[#22C55E]' : 'text-[#DC2626] dark:text-[#F87171]'
                      }`}
                    >
                      {tx.amount >= 0 ? `+${tx.amount.toLocaleString()}` : tx.amount.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                      {tx.newBalance.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust Credits Modal */}
      <Modal
        isOpen={isAdjustOpen}
        onClose={() => setIsAdjustOpen(false)}
        title="Manual Credit Adjustment"
        subtitle="Creates an atomic ledger transaction and audit log entry."
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleAdjustSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-[#11162B] dark:text-[#F3F5FA] mb-1">Target User *</label>
            <select
              required
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            >
              {users.length === 0 && <option value="">No registered users found</option>}
              {users.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.displayName} ({u.email}) — {u.remainingCredits.toLocaleString()} cr
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['add', 'deduct', 'set'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`h-9 rounded-lg font-medium capitalize whitespace-nowrap transition-colors cursor-pointer ${
                  mode === m
                    ? 'bg-[#2E5BFF] dark:bg-[#4D74FF] text-white'
                    : 'bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7]'
                }`}
              >
                {m === 'set' ? 'Set Starting Bal' : m}
              </button>
            ))}
          </div>

          <div>
            <label className="block font-medium text-[#11162B] dark:text-[#F3F5FA] mb-1">Credits Amount *</label>
            <input
              type="number"
              min={0}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] font-mono tabular-nums focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            />
          </div>

          <div>
            <label className="block font-medium text-[#11162B] dark:text-[#F3F5FA] mb-1">Mandatory Reason *</label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Manual top-up bonus, billing reconciliation"
              className="w-full h-10 px-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            />
          </div>

          <div>
            <label className="block font-medium text-[#11162B] dark:text-[#F3F5FA] mb-1">Optional Internal Note</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAdjustOpen(false)}
              className="h-9 px-4 rounded-lg border border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7] font-medium whitespace-nowrap cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || users.length === 0}
              className="h-9 px-5 rounded-lg bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white font-medium flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Confirm Adjustment</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
