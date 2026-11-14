import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Power, KeyRound, Edit3, Loader2, Shield, CheckCircle2, Ban } from 'lucide-react';
import { adminApi } from '../api.js';
import { AdminAccountPublic, AdminRole } from '../types.js';
import { useToast } from '../../context/ToastContext.js';
import { Modal } from '../../components/ui/index.js';

export const AdminAccountsView: React.FC<{ currentAdminId: string }> = ({ currentAdminId }) => {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<AdminAccountPublic[]>([]);
  const [roleTemplates, setRoleTemplates] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminAccountPublic | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminAccountPublic | null>(null);

  // Create form
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<AdminRole>('Support Manager');
  const [initialPassword, setInitialPassword] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);

  // Reset password form
  const [resetPwd, setResetPwd] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getAdminAccounts();
      setAccounts(res.accounts);
      setRoleTemplates(res.roleTemplates);
    } catch (err: any) {
      showToast(err.message || 'Failed to load administrator accounts.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOpenCreate = () => {
    setEmail('');
    setName('');
    setRole('Support Manager');
    setPermissions(roleTemplates['Support Manager'] || []);
    setInitialPassword('');
    setCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.createAdminAccount({
        email: email.trim(),
        name: name.trim(),
        role,
        permissions,
        initialPassword,
      });
      showToast(`Administrator ${email} created.`, 'success');
      setCreateOpen(false);
      await load();
    } catch (err: any) {
      showToast(err.message || 'Failed to create administrator.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    try {
      await adminApi.updateAdminAccount(editTarget.id, {
        name: name.trim(),
        role,
        permissions,
      });
      showToast(`Updated administrator ${editTarget.email}.`, 'success');
      setEditTarget(null);
      await load();
    } catch (err: any) {
      showToast(err.message || 'Failed to update administrator.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (acc: AdminAccountPublic) => {
    try {
      await adminApi.updateAdminAccount(acc.id, { isActive: !acc.isActive });
      showToast(`${acc.email} ${acc.isActive ? 'deactivated' : 'activated'}.`, 'info');
      await load();
    } catch (err: any) {
      showToast(err.message || 'Action blocked.', 'error');
    }
  };

  const handleResetPwd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setSaving(true);
    try {
      const res = await adminApi.resetAdminAccountPassword(resetTarget.id, resetPwd);
      showToast(res.message, 'success');
      setResetTarget(null);
      setResetPwd('');
    } catch (err: any) {
      showToast(err.message || 'Failed to reset password.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7]">
          Create role-based administrator accounts, manage RBAC module permissions, and enforce security resets.
        </p>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="h-9 px-4 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 dark:focus-visible:ring-[#4D74FF]/40"
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span>Add Administrator</span>
        </button>
      </div>

      <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E4E7EF] dark:border-[#1E2638] bg-[#F7F8FA] dark:bg-[#0D121D] text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">
                <th className="py-2.5 px-4 font-semibold">Administrator</th>
                <th className="py-2.5 px-4 font-semibold">Role</th>
                <th className="py-2.5 px-4 font-semibold">Status</th>
                <th className="py-2.5 px-4 font-semibold">Last Login</th>
                <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EF] dark:divide-[#1E2638]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-[#5A6580] dark:text-[#A2ADC7]">
                    Loading administrator accounts...
                  </td>
                </tr>
              ) : (
                accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-[#F2F4F8]/70 dark:hover:bg-[#171E2E]/60 transition-colors duration-150">
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-[#11162B] dark:text-[#F3F5FA] flex items-center gap-1.5">
                        <span>{acc.name}</span>
                        {acc.id === currentAdminId && (
                          <span className="text-[10px] font-semibold text-[#2E5BFF] dark:text-[#7A9AFF]">(You)</span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] font-mono">{acc.email}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-[#2E5BFF] dark:text-[#7A9AFF]">
                        <Shield className="w-3.5 h-3.5 shrink-0" />
                        {acc.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
                          acc.isActive
                            ? 'text-[#16A34A] dark:text-[#22C55E]'
                            : 'text-[#DC2626] dark:text-[#F87171]'
                        }`}
                      >
                        {acc.isActive ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <Ban className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{acc.isActive ? 'Active' : 'Deactivated'}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">
                      {acc.lastLoginAt ? new Date(acc.lastLoginAt).toLocaleString() : 'Never'}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditTarget(acc);
                            setName(acc.name);
                            setRole(acc.role);
                            setPermissions(acc.permissions);
                          }}
                          title="Edit Role & Permissions"
                          className="p-1.5 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResetTarget(acc);
                            setResetPwd('');
                          }}
                          title="Reset Password"
                          className="p-1.5 rounded-lg hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] text-[#5A6580] dark:text-[#A2ADC7] cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(acc)}
                          title={acc.isActive ? 'Deactivate' : 'Activate'}
                          className={`p-1.5 rounded-lg cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 ${
                            acc.isActive
                              ? 'hover:bg-[#DC2626]/12 text-[#16A34A] dark:text-[#22C55E]'
                              : 'hover:bg-[#16A34A]/12 text-[#5A6580] dark:text-[#A2ADC7]'
                          }`}
                        >
                          <Power className="w-4 h-4" />
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

      {/* Create Admin Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Administrator Account"
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleCreate} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Email *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => {
                const nextRole = e.target.value as AdminRole;
                setRole(nextRole);
                setPermissions(roleTemplates[nextRole] || []);
              }}
              className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            >
              <option value="Super Admin">Super Admin (Full Access)</option>
              <option value="Finance Manager">Finance Manager</option>
              <option value="Support Manager">Support Manager</option>
              <option value="Content Manager">Content Manager</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">
              Initial Password (min 10 chars, mixed case + number/symbol) *
            </label>
            <input
              type="password"
              required
              value={initialPassword}
              onChange={(e) => setInitialPassword(e.target.value)}
              className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="h-9 px-4 rounded-xl border border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 px-5 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Create Account</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Role Modal */}
      <Modal
        isOpen={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title={`Edit Admin: ${editTarget?.email || ''}`}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleUpdate} className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            />
          </div>
          <div>
            <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => {
                const nextRole = e.target.value as AdminRole;
                setRole(nextRole);
                setPermissions(roleTemplates[nextRole] || []);
              }}
              className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            >
              <option value="Super Admin">Super Admin</option>
              <option value="Finance Manager">Finance Manager</option>
              <option value="Support Manager">Support Manager</option>
              <option value="Content Manager">Content Manager</option>
            </select>
          </div>
          <div className="p-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] font-mono text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">
            Permissions: {permissions.join(', ')}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditTarget(null)}
              className="h-9 px-4 rounded-xl border border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 px-5 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150 disabled:opacity-50"
            >
              Save Role
            </button>
          </div>
        </form>
      </Modal>

      {/* Reset Admin Password Modal */}
      <Modal
        isOpen={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`Reset Password: ${resetTarget?.email || ''}`}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleResetPwd} className="space-y-3 text-xs">
          <p className="text-[#5A6580] dark:text-[#A2ADC7]">
            Set a new strong password for this administrator. Existing active sessions for this account will be signed out.
          </p>
          <input
            type="password"
            required
            value={resetPwd}
            onChange={(e) => setResetPwd(e.target.value)}
            placeholder="New password (min 10 chars)"
            className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setResetTarget(null)}
              className="h-9 px-4 rounded-xl border border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 px-4 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150 disabled:opacity-50"
            >
              Update Password
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
