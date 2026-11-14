import React, { useEffect, useState, useCallback } from 'react';
import {
  Search,
  UserCheck,
  UserX,
  Trash2,
  Eye,
  Coins,
  Save,
  X,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { adminApi } from '../api.js';
import {
  AdminUserRecord,
  AdminPlanRecord,
  AdminProjectRecord,
  AdminPaymentRecord,
  AdminCreditTransaction,
  AdminSpeechRecord,
} from '../types.js';
import { useToast } from '../../context/ToastContext.js';
import { Modal } from '../../components/ui/index.js';

interface AdminUsersViewProps {
  globalSearch?: string;
}

export const AdminUsersView: React.FC<AdminUsersViewProps> = ({ globalSearch = '' }) => {
  const { showToast } = useToast();
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [plans, setPlans] = useState<AdminPlanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(globalSearch);
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [googleFilter, setGoogleFilter] = useState('all');

  // Detail modal state
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<{
    user: AdminUserRecord;
    projects: AdminProjectRecord[];
    paymentHistory: AdminPaymentRecord[];
    creditTransactions: AdminCreditTransaction[];
    speechHistory: AdminSpeechRecord[];
  } | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'payments' | 'credits' | 'history' | 'projects'>('overview');

  // Edit profile state
  const [editName, setEditName] = useState('');
  const [editPlanId, setEditPlanId] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [isSavingUser, setIsSavingUser] = useState(false);

  // Quick credit adjust in user detail
  const [creditMode, setCreditMode] = useState<'add' | 'deduct' | 'set'>('add');
  const [creditAmount, setCreditAmount] = useState('500');
  const [creditReason, setCreditReason] = useState('');

  // Confirm dialogs
  const [suspendTarget, setSuspendTarget] = useState<AdminUserRecord | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRecord | null>(null);

  useEffect(() => {
    setQ(globalSearch);
  }, [globalSearch]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, pRes] = await Promise.all([
        adminApi.getUsers({ q: q.trim(), status: statusFilter, plan: planFilter, google: googleFilter }),
        adminApi.getPlans(),
      ]);
      setUsers(uRes.users);
      setPlans(pRes.plans);
    } catch (err: any) {
      showToast(err.message || 'Failed to load users.', 'error');
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter, planFilter, googleFilter, showToast]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const openUserDetail = async (uid: string) => {
    setSelectedUid(uid);
    setDetailTab('overview');
    setDetailLoading(true);
    try {
      const res = await adminApi.getUserDetail(uid);
      setDetailData(res);
      setEditName(res.user.displayName);
      setEditPlanId(res.user.planId);
      setEditNotes(res.user.notes || '');
    } catch (err: any) {
      showToast(err.message || 'Failed to load user details.', 'error');
      setSelectedUid(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSaveUserEdit = async () => {
    if (!detailData) return;
    setIsSavingUser(true);
    try {
      await adminApi.updateUser(detailData.user.uid, {
        displayName: editName,
        planId: editPlanId,
        notes: editNotes,
      });
      showToast('User profile updated.', 'success');
      await openUserDetail(detailData.user.uid);
      await loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Failed to update user.', 'error');
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleQuickCreditAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailData || !creditReason.trim()) {
      showToast('Please provide a reason for credit adjustment.', 'warning');
      return;
    }
    try {
      await adminApi.adjustCredits({
        userId: detailData.user.uid,
        mode: creditMode,
        amount: Number(creditAmount),
        reason: creditReason.trim(),
      });
      showToast('Credits updated atomically.', 'success');
      setCreditReason('');
      await openUserDetail(detailData.user.uid);
      await loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Credit adjustment failed.', 'error');
    }
  };

  const handleSuspendConfirm = async () => {
    if (!suspendTarget) return;
    try {
      await adminApi.suspendUser(suspendTarget.uid, suspendReason || 'Suspended by administrator');
      showToast(`${suspendTarget.email} suspended.`, 'info');
      setSuspendTarget(null);
      setSuspendReason('');
      if (selectedUid === suspendTarget.uid) await openUserDetail(suspendTarget.uid);
      await loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Failed to suspend user.', 'error');
    }
  };

  const handleReactivate = async (user: AdminUserRecord) => {
    try {
      await adminApi.reactivateUser(user.uid);
      showToast(`${user.email} reactivated.`, 'success');
      if (selectedUid === user.uid) await openUserDetail(user.uid);
      await loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Failed to reactivate user.', 'error');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await adminApi.deleteUser(deleteTarget.uid);
      showToast(`User ${deleteTarget.email} permanently deleted.`, 'info');
      setDeleteTarget(null);
      if (selectedUid === deleteTarget.uid) {
        setSelectedUid(null);
        setDetailData(null);
      }
      await loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete user.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      {/* Filter Bar */}
      <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#78839E] dark:text-[#7C87A3] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, email, UID, or Google sub..."
            className="w-full h-9 pl-10 pr-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <select
          value={googleFilter}
          onChange={(e) => setGoogleFilter(e.target.value)}
          className="h-9 px-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
        >
          <option value="all">All Auth Providers</option>
          <option value="google">Google Sign-In Users</option>
          <option value="bonus_claimed">Welcome Bonus Claimed</option>
          <option value="no_bonus">No Welcome Bonus</option>
        </select>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className="h-9 px-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
        >
          <option value="all">All Plans</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E4E7EF] dark:border-[#1E2638] bg-[#F7F8FA] dark:bg-[#0D121D] text-[11px] font-semibold text-[#5A6580] dark:text-[#A2ADC7]">
                <th className="py-2.5 px-4">User</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Plan</th>
                <th className="py-2.5 px-4 text-right">Credits Left</th>
                <th className="py-2.5 px-4 text-right">Consumed</th>
                <th className="py-2.5 px-4">Last Login</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EF] dark:divide-[#1E2638]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#5A6580] dark:text-[#A2ADC7]">
                    Loading registered users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#5A6580] dark:text-[#A2ADC7]">
                    No registered users match your filters.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.uid} className="hover:bg-[#F7F8FA] dark:hover:bg-[#171E2E]/60 transition-colors">
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                        {u.displayName}
                      </div>
                      <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">{u.email}</div>
                      <div className="text-[10px] font-mono text-[#78839E] dark:text-[#7C87A3]">
                        {u.authProvider === 'google' || u.googleSub ? 'Google' : 'Standard'}
                        {u.welcomeBonusClaimed
                          ? ` · +${(u.welcomeBonusAmount || 5000).toLocaleString()} bonus`
                          : ''}
                        {` · ${u.uid}`}
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-medium capitalize ${
                          u.status === 'active'
                            ? 'text-[#16A34A] dark:text-[#22C55E]'
                            : 'text-[#DC2626] dark:text-[#F87171]'
                        }`}
                      >
                        {u.status === 'active' ? (
                          <UserCheck className="w-3.5 h-3.5" />
                        ) : (
                          <UserX className="w-3.5 h-3.5" />
                        )}
                        <span>{u.status}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-[#2E5BFF] dark:text-[#7A9AFF]">{u.planName}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                      {u.remainingCredits.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#5A6580] dark:text-[#A2ADC7]">
                      {u.totalConsumedCredits.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">
                      {new Date(u.lastLoginAt).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openUserDetail(u.uid)}
                          title="Inspect & Manage User"
                          className="p-1.5 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#171E2E] text-[#2E5BFF] dark:text-[#7A9AFF] cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {u.status === 'active' ? (
                          <button
                            type="button"
                            onClick={() => setSuspendTarget(u)}
                            title="Suspend User"
                            className="p-1.5 rounded-lg hover:bg-[#D97706]/15 text-[#D97706] dark:text-[#F59E0B] cursor-pointer"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleReactivate(u)}
                            title="Reactivate User"
                            className="p-1.5 rounded-lg hover:bg-[#16A34A]/15 text-[#16A34A] dark:text-[#22C55E] cursor-pointer"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(u)}
                          title="Delete User"
                          className="p-1.5 rounded-lg hover:bg-[#DC2626]/15 text-[#DC2626] dark:text-[#F87171] cursor-pointer"
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

      {/* User Detail Inspector Modal */}
      <Modal
        isOpen={Boolean(selectedUid)}
        onClose={() => {
          setSelectedUid(null);
          setDetailData(null);
        }}
        title={detailData ? `${detailData.user.displayName}` : 'User Profile'}
        subtitle={detailData ? `${detailData.user.email} · UID: ${detailData.user.uid}` : ''}
        maxWidthClass="max-w-4xl"
      >
        {detailLoading || !detailData ? (
          <div className="py-12 flex items-center justify-center text-xs text-[#5A6580] dark:text-[#A2ADC7] gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading full user record...</span>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Tabs */}
            <div className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638]">
              {(
                [
                  { id: 'overview', label: 'Profile & Controls' },
                  { id: 'credits', label: `Credits (${detailData.creditTransactions.length})` },
                  { id: 'payments', label: `Payments (${detailData.paymentHistory.length})` },
                  { id: 'history', label: `Speech History (${detailData.speechHistory.length})` },
                  { id: 'projects', label: `Projects (${detailData.projects.length})` },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDetailTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    detailTab === t.id
                      ? 'bg-white dark:bg-[#101521] text-[#2E5BFF] dark:text-[#7A9AFF] shadow-xs'
                      : 'text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {detailTab === 'overview' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Profile & Plan Editor */}
                <div className="p-4 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] space-y-3">
                  <div className="font-display text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                    Account Details & Subscription
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#5A6580] dark:text-[#A2ADC7] mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#5A6580] dark:text-[#A2ADC7] mb-1">
                      Active Plan
                    </label>
                    <select
                      value={editPlanId}
                      onChange={(e) => setEditPlanId(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                    >
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.credits.toLocaleString()} credits)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#5A6580] dark:text-[#A2ADC7] mb-1">
                      Internal Admin Notes
                    </label>
                    <textarea
                      rows={2}
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      className="w-full p-2.5 rounded-lg bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                    />
                  </div>
                  <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] font-mono tabular-nums space-y-0.5 pt-1">
                    <div>Registered: {new Date(detailData.user.createdAt).toLocaleString()}</div>
                    <div>Last Login: {new Date(detailData.user.lastLoginAt).toLocaleString()}</div>
                    <div>
                      Auth Provider: {detailData.user.authProvider === 'google' || detailData.user.googleSub ? 'Google OAuth' : 'Standard'}
                    </div>
                    {detailData.user.googleSub && (
                      <div className="truncate">Google Sub: {detailData.user.googleSub}</div>
                    )}
                    <div>
                      Welcome Bonus:{' '}
                      {detailData.user.welcomeBonusClaimed
                        ? `+${(detailData.user.welcomeBonusAmount || 5000).toLocaleString()} cr (${
                            detailData.user.welcomeBonusAwardedAt
                              ? new Date(detailData.user.welcomeBonusAwardedAt).toLocaleDateString()
                              : 'claimed'
                          })`
                        : 'Not claimed'}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isSavingUser}
                    onClick={handleSaveUserEdit}
                    className="w-full h-9 rounded-lg bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                  >
                    <Save className="w-3.5 h-3.5 shrink-0" />
                    <span>{isSavingUser ? 'Saving...' : 'Save Account Changes'}</span>
                  </button>
                </div>

                {/* Quick Credit Adjuster */}
                <form
                  onSubmit={handleQuickCreditAdjust}
                  className="p-4 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] flex items-center gap-1.5">
                      <Coins className="w-4 h-4 text-[#2E5BFF] dark:text-[#7A9AFF]" />
                      <span>Manual Credit Control</span>
                    </span>
                    <span className="font-mono tabular-nums font-bold text-sm text-[#2E5BFF] dark:text-[#7A9AFF]">
                      {detailData.user.remainingCredits.toLocaleString()} cr
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['add', 'deduct', 'set'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setCreditMode(m)}
                        className={`h-8 rounded-lg text-xs font-medium capitalize cursor-pointer whitespace-nowrap transition-colors ${
                          creditMode === m
                            ? 'bg-[#2E5BFF] dark:bg-[#4D74FF] text-white'
                            : 'bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7]'
                        }`}
                      >
                        {m === 'set' ? 'Set Balance' : m}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#5A6580] dark:text-[#A2ADC7] mb-1">
                      Amount
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={creditAmount}
                      onChange={(e) => setCreditAmount(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] text-xs font-mono tabular-nums text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#5A6580] dark:text-[#A2ADC7] mb-1">
                      Reason (required for audit log) *
                    </label>
                    <input
                      type="text"
                      required
                      value={creditReason}
                      onChange={(e) => setCreditReason(e.target.value)}
                      placeholder="e.g. Promotional bonus, refund, support grant"
                      className="w-full h-9 px-3 rounded-lg bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full h-9 rounded-lg bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-medium cursor-pointer whitespace-nowrap transition-colors"
                  >
                    Apply Credit Adjustment
                  </button>
                </form>
              </div>
            )}

            {detailTab === 'credits' && (
              <div className="max-h-72 overflow-y-auto divide-y divide-[#E4E7EF] dark:divide-[#1E2638] text-xs">
                {detailData.creditTransactions.length === 0 ? (
                  <p className="py-8 text-center text-[#5A6580] dark:text-[#A2ADC7]">No credit transactions recorded.</p>
                ) : (
                  detailData.creditTransactions.map((tx) => (
                    <div key={tx.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-[#11162B] dark:text-[#F3F5FA]">{tx.reason}</div>
                        <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">
                          {tx.type} · {new Date(tx.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <div className={tx.amount >= 0 ? 'text-[#16A34A] dark:text-[#22C55E] font-bold' : 'text-[#DC2626] dark:text-[#F87171] font-bold'}>
                          {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}
                        </div>
                        <div className="text-[10px] text-[#5A6580] dark:text-[#A2ADC7]">Bal: {tx.newBalance.toLocaleString()}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {detailTab === 'payments' && (
              <div className="max-h-72 overflow-y-auto divide-y divide-[#E4E7EF] dark:divide-[#1E2638] text-xs">
                {detailData.paymentHistory.length === 0 ? (
                  <p className="py-8 text-center text-[#5A6580] dark:text-[#A2ADC7]">No payment requests submitted.</p>
                ) : (
                  detailData.paymentHistory.map((p) => (
                    <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                          {p.planName} ({p.billingCycle}) · ${p.amountUsd}
                        </div>
                        <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] font-mono tabular-nums">
                          Tx: {p.transactionId} · {p.paymentMethod}
                        </div>
                      </div>
                      <span className="font-semibold capitalize text-[#11162B] dark:text-[#F3F5FA]">{p.status}</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {detailTab === 'history' && (
              <div className="max-h-72 overflow-y-auto divide-y divide-[#E4E7EF] dark:divide-[#1E2638] text-xs">
                {detailData.speechHistory.length === 0 ? (
                  <p className="py-8 text-center text-[#5A6580] dark:text-[#A2ADC7]">No speech generations yet.</p>
                ) : (
                  detailData.speechHistory.map((s) => (
                    <div key={s.id} className="py-2.5 space-y-1">
                      <div className="flex justify-between font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                        <span>{s.voiceName}</span>
                        <span className="font-mono tabular-nums text-[#5A6580] dark:text-[#A2ADC7]">
                          {s.creditCost} cr · {s.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] line-clamp-2">{s.text}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {detailTab === 'projects' && (
              <div className="max-h-72 overflow-y-auto divide-y divide-[#E4E7EF] dark:divide-[#1E2638] text-xs">
                {detailData.projects.length === 0 ? (
                  <p className="py-8 text-center text-[#5A6580] dark:text-[#A2ADC7]">No saved projects yet.</p>
                ) : (
                  detailData.projects.map((pr) => (
                    <div key={pr.id} className="py-2.5">
                      <div className="font-semibold text-[#11162B] dark:text-[#F3F5FA]">{pr.name}</div>
                      <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] line-clamp-2">{pr.script}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Suspend Confirmation Modal */}
      <Modal
        isOpen={Boolean(suspendTarget)}
        onClose={() => setSuspendTarget(null)}
        title="Confirm User Suspension"
        subtitle={suspendTarget ? `Suspend ${suspendTarget.email}` : ''}
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[#5A6580] dark:text-[#A2ADC7]">
            Suspended users are blocked from signing in, syncing, or generating speech until reactivated.
          </p>
          <input
            type="text"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            placeholder="Reason for suspension (optional)"
            className="w-full h-9 px-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSuspendTarget(null)}
              className="h-9 px-4 rounded-lg border border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7] font-medium cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSuspendConfirm}
              className="h-9 px-4 rounded-lg bg-[#D97706] hover:bg-[#B45309] text-white font-medium cursor-pointer whitespace-nowrap transition-colors"
            >
              Suspend Account
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Permanently Delete User"
        subtitle={deleteTarget ? deleteTarget.email : ''}
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 rounded-lg bg-[#DC2626]/10 border border-[#DC2626]/25 text-[#DC2626] dark:text-[#F87171] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              This permanently removes the user profile and their projects. Financial payment logs &
              audit history remain preserved.
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="h-9 px-4 rounded-lg border border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7] font-medium cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirm}
              className="h-9 px-4 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white font-medium cursor-pointer whitespace-nowrap transition-colors"
            >
              Delete Permanently
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
