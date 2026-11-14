import React, { useEffect, useState, useCallback } from 'react';
import {
  Save,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  Sliders,
} from 'lucide-react';
import { adminApi } from '../api.js';
import { AdminAccountPublic, AdminPlatformSettings, AdminPlanRecord } from '../types.js';
import { useToast } from '../../context/ToastContext.js';
import { Modal } from '../../components/ui/index.js';

export type AdminSettingsTab = 'general' | 'security';

interface AdminSettingsViewProps {
  activeTab?: AdminSettingsTab;
  onTabChange?: (tab: AdminSettingsTab) => void;
  canViewGeneral?: boolean;
  adminEmail?: string;
  onAdminUpdated?: (admin: AdminAccountPublic) => void;
}

export const AdminSettingsView: React.FC<AdminSettingsViewProps> = ({
  activeTab: controlledTab,
  onTabChange,
  canViewGeneral = true,
  adminEmail,
  onAdminUpdated,
}) => {
  const { showToast } = useToast();
  const [internalTab, setInternalTab] = useState<AdminSettingsTab>(
    canViewGeneral ? 'general' : 'security'
  );
  const currentTab: AdminSettingsTab = !canViewGeneral
    ? 'security'
    : controlledTab ?? internalTab;

  const setTab = (tab: AdminSettingsTab) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  // General platform settings state
  const [settings, setSettings] = useState<AdminPlatformSettings | null>(null);
  const [plans, setPlans] = useState<AdminPlanRecord[]>([]);
  const [loading, setLoading] = useState(canViewGeneral);
  const [saving, setSaving] = useState(false);
  const [confirmMaintenanceOpen, setConfirmMaintenanceOpen] = useState(false);

  const [methodsText, setMethodsText] = useState('');
  const [languagesText, setLanguagesText] = useState('');

  // Security -> Change Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSaving, setPwdSaving] = useState(false);

  const load = useCallback(async () => {
    if (!canViewGeneral) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [sRes, pRes] = await Promise.all([adminApi.getSettings(), adminApi.getPlans()]);
      setSettings(sRes.settings);
      setPlans(pRes.plans);
      setMethodsText(sRes.settings.acceptedPaymentMethods.join(', '));
      setLanguagesText(sRes.settings.supportedLanguages.join(', '));
    } catch (err: any) {
      showToast(err.message || 'Failed to load platform settings.', 'error');
    } finally {
      setLoading(false);
    }
  }, [canViewGeneral, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const performSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const payload: Partial<AdminPlatformSettings> = {
        ...settings,
        acceptedPaymentMethods: methodsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        supportedLanguages: languagesText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const res = await adminApi.updateSettings(payload);
      setSettings(res.settings);
      showToast('Platform settings saved and applied live.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save platform settings.', 'error');
    } finally {
      setSaving(false);
      setConfirmMaintenanceOpen(false);
    }
  };

  const handleSubmitSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    if (settings.maintenanceMode) {
      setConfirmMaintenanceOpen(true);
      return;
    }
    await performSave();
  };

  const validateNewPasswordClient = (pwd: string): string | null => {
    if (!pwd || pwd.length < 10) {
      return 'New password must be at least 10 characters long.';
    }
    const categories = [
      /[A-Z]/.test(pwd),
      /[a-z]/.test(pwd),
      /\d/.test(pwd),
      /[^A-Za-z0-9]/.test(pwd),
    ].filter(Boolean).length;
    if (categories < 3) {
      return 'New password must contain at least 3 of: uppercase letters, lowercase letters, numbers, and symbols.';
    }
    return null;
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);

    if (!currentPassword) {
      setPwdError('Current password is required.');
      return;
    }

    const strengthError = validateNewPasswordClient(newPassword);
    if (strengthError) {
      setPwdError(strengthError);
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPwdError('New password and confirmation do not match.');
      return;
    }

    if (currentPassword === newPassword) {
      setPwdError('New password must be different from your current password.');
      return;
    }

    setPwdSaving(true);
    try {
      const res = await adminApi.changePassword(
        currentPassword,
        newPassword,
        confirmNewPassword
      );
      onAdminUpdated?.(res.admin);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setShowCurrentPwd(false);
      setShowNewPwd(false);
      setShowConfirmPwd(false);
      showToast('Administrator password updated successfully.', 'success');
    } catch (err: any) {
      setPwdError(err.message || 'Failed to update password.');
    } finally {
      setPwdSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-xs">
      {/* Sub-navigation tabs: General & Security */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div
          role="tablist"
          aria-label="Settings sections"
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638]"
        >
          {canViewGeneral && (
            <button
              type="button"
              role="tab"
              aria-selected={currentTab === 'general'}
              onClick={() => setTab('general')}
              className={`h-8 px-4 rounded-lg text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer ${
                currentTab === 'general'
                  ? 'bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF]'
                  : 'text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 shrink-0" />
              <span>General</span>
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={currentTab === 'security'}
            onClick={() => setTab('security')}
            className={`h-8 px-4 rounded-lg text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer ${
              currentTab === 'security'
                ? 'bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF]'
                : 'text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>Security</span>
          </button>
        </div>
      </div>

      {currentTab === 'security' ? (
        <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-6 max-w-2xl space-y-5">
          <div className="space-y-1 border-b border-[#E4E7EF] dark:border-[#1E2638] pb-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#2E5BFF] dark:text-[#7A9AFF] shrink-0" />
              <h3 className="font-display text-sm font-bold text-[#11162B] dark:text-[#F3F5FA]">
                Change Password
              </h3>
            </div>
            <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] leading-relaxed">
              Manage the credentials for{' '}
              <span className="font-mono font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                {adminEmail || 'your administrator account'}
              </span>
              . Your password remains permanently active unless you update it here.
            </p>
          </div>

          {pwdError && (
            <div className="p-3 rounded-xl bg-[#DC2626]/10 text-xs text-[#DC2626] dark:text-[#F87171] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{pwdError}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1.5">
                Current Password
              </label>
              <div className="relative">
                <input
                  type={showCurrentPwd ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                  className="w-full h-9 pl-3.5 pr-10 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#78839E] dark:text-[#7C87A3] hover:text-[#11162B] dark:hover:text-[#F3F5FA] transition-colors duration-150 cursor-pointer"
                  aria-label={showCurrentPwd ? 'Hide current password' : 'Show current password'}
                >
                  {showCurrentPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1.5">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNewPwd ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 10 chars, mixed case + digits/symbols)"
                  autoComplete="new-password"
                  className="w-full h-9 pl-3.5 pr-10 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#78839E] dark:text-[#7C87A3] hover:text-[#11162B] dark:hover:text-[#F3F5FA] transition-colors duration-150 cursor-pointer"
                  aria-label={showNewPwd ? 'Hide new password' : 'Show new password'}
                >
                  {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">
                Minimum 10 characters with at least 3 of: uppercase letters, lowercase letters, numbers, and symbols.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1.5">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPwd ? 'text' : 'password'}
                  required
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  className="w-full h-9 pl-3.5 pr-10 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#78839E] dark:text-[#7C87A3] hover:text-[#11162B] dark:hover:text-[#F3F5FA] transition-colors duration-150 cursor-pointer"
                  aria-label={showConfirmPwd ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#E4E7EF] dark:border-[#1E2638]">
              <button
                type="submit"
                disabled={pwdSaving}
                className="h-9 px-5 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white font-semibold flex items-center gap-2 transition-colors duration-150 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 dark:focus-visible:ring-[#4D74FF]/40"
              >
                {pwdSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <KeyRound className="w-3.5 h-3.5" />
                )}
                <span>Update Password</span>
              </button>
            </div>
          </form>
        </div>
      ) : loading || !settings ? (
        <div className="py-12 text-center text-xs text-[#5A6580] dark:text-[#A2ADC7]">Loading platform settings...</div>
      ) : (
        <form onSubmit={handleSubmitSettings} className="space-y-6">
          {/* Branding & Support */}
          <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-5 space-y-4">
            <h3 className="font-display text-sm font-bold text-[#11162B] dark:text-[#F3F5FA]">Website Branding &amp; Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Platform Name</label>
                <input
                  type="text"
                  value={settings.siteName}
                  onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                  className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Support Email</label>
                <input
                  type="email"
                  value={settings.supportEmail}
                  onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                  className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Custom Logo URL (optional)</label>
                <input
                  type="text"
                  value={settings.logoUrl}
                  onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Favicon URL (optional)</label>
                <input
                  type="text"
                  value={settings.faviconUrl}
                  onChange={(e) => setSettings({ ...settings, faviconUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Contact Information</label>
                <input
                  type="text"
                  value={settings.contactInfo}
                  onChange={(e) => setSettings({ ...settings, contactInfo: e.target.value })}
                  className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                />
              </div>
            </div>
          </div>

          {/* Onboarding, Credits & Limits */}
          <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-5 space-y-4">
            <h3 className="font-display text-sm font-bold text-[#11162B] dark:text-[#F3F5FA]">Registration, Credits &amp; Speech Limits</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Google Welcome Bonus Credits</label>
                <input
                  type="number"
                  min={0}
                  value={settings.signupBonusCredits ?? 5000}
                  onChange={(e) =>
                    setSettings({ ...settings, signupBonusCredits: Number(e.target.value) || 0 })
                  }
                  className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] font-mono tabular-nums focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Non-Google Default Credits</label>
                <input
                  type="number"
                  min={0}
                  value={settings.defaultCredits}
                  onChange={(e) =>
                    setSettings({ ...settings, defaultCredits: Number(e.target.value) || 0 })
                  }
                  className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] font-mono tabular-nums focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Default Plan</label>
                <select
                  value={settings.defaultPlanId}
                  onChange={(e) => setSettings({ ...settings, defaultPlanId: e.target.value })}
                  className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Audio Generation Rate</label>
                <div className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] font-mono flex items-center justify-between text-[#11162B] dark:text-[#F3F5FA]">
                  <span>1 credit / trimmed char</span>
                  <span className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">Fixed 1:1</span>
                </div>
              </div>
              <div>
                <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Transcript Surcharge (%)</label>
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={settings.transcriptSurchargePercent ?? 25}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      transcriptSurchargePercent: Math.max(0, Math.min(200, Number(e.target.value) || 0)),
                    })
                  }
                  className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] font-mono tabular-nums focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Guest Preview Cap (chars)</label>
                <input
                  type="number"
                  min={500}
                  max={200000}
                  value={settings.maxTextChars}
                  onChange={(e) =>
                    setSettings({ ...settings, maxTextChars: Number(e.target.value) || 5000 })
                  }
                  className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] font-mono tabular-nums focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Supported Languages (comma-separated)</label>
              <input
                type="text"
                value={languagesText}
                onChange={(e) => setLanguagesText(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>

            <div className="flex flex-wrap gap-6 pt-1 text-[#5A6580] dark:text-[#A2ADC7]">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                <input
                  type="checkbox"
                  checked={settings.signupBonusEnabled !== false}
                  onChange={(e) => setSettings({ ...settings, signupBonusEnabled: e.target.checked })}
                  className="accent-[#2E5BFF] dark:accent-[#4D74FF]"
                />
                <span>Award One-Time Welcome Bonus on New Google Sign-Up</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allowRegistration}
                  onChange={(e) => setSettings({ ...settings, allowRegistration: e.target.checked })}
                  className="accent-[#2E5BFF] dark:accent-[#4D74FF]"
                />
                <span>Allow New User Registrations</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.notifyAdminOnNewPayment}
                  onChange={(e) =>
                    setSettings({ ...settings, notifyAdminOnNewPayment: e.target.checked })
                  }
                  className="accent-[#2E5BFF] dark:accent-[#4D74FF]"
                />
                <span>Notify Admins on New Payments</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.notifyUserOnPaymentDecision}
                  onChange={(e) =>
                    setSettings({ ...settings, notifyUserOnPaymentDecision: e.target.checked })
                  }
                  className="accent-[#2E5BFF] dark:accent-[#4D74FF]"
                />
                <span>Notify Users on Payment Approval / Rejection</span>
              </label>
            </div>
          </div>

          {/* Payment Instructions & Maintenance Mode */}
          <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-5 space-y-4">
            <h3 className="font-display text-sm font-bold text-[#11162B] dark:text-[#F3F5FA]">Checkout &amp; Maintenance Mode</h3>
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">
                Accepted Payment Methods (comma-separated)
              </label>
              <input
                type="text"
                value={methodsText}
                onChange={(e) => setMethodsText(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Checkout Payment Instructions</label>
              <textarea
                rows={3}
                value={settings.paymentInstructions}
                onChange={(e) => setSettings({ ...settings, paymentInstructions: e.target.value })}
                className="w-full p-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>

            <div className="p-4 rounded-xl bg-[#D97706]/8 dark:bg-[#F59E0B]/10 space-y-3">
              <label className="flex items-center gap-2.5 font-bold text-[#B45309] dark:text-[#F59E0B] cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.maintenanceMode}
                  onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                  className="accent-[#D97706] dark:accent-[#F59E0B]"
                />
                <span>
                  Enable Maintenance Mode (Blocks non-admin users from Studio TTS generation)
                </span>
              </label>
              <input
                type="text"
                value={settings.maintenanceMessage}
                onChange={(e) => setSettings({ ...settings, maintenanceMessage: e.target.value })}
                placeholder="Maintenance notice displayed to visitors"
                className="w-full h-9 px-3 rounded-xl bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#D97706] dark:focus:border-[#F59E0B]"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="h-9 px-5 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white font-semibold flex items-center gap-2 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 dark:focus-visible:ring-[#4D74FF]/40"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Save Platform Settings</span>
            </button>
          </div>

          <Modal
            isOpen={confirmMaintenanceOpen}
            onClose={() => setConfirmMaintenanceOpen(false)}
            title="Confirm Maintenance Mode"
            maxWidthClass="max-w-md"
          >
            <div className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-[#D97706]/10 text-[#B45309] dark:text-[#F59E0B] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Enabling Maintenance Mode will restrict Speakly Studio access for public visitors
                  while keeping <code className="font-mono">/admin</code> accessible to administrators.
                </span>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmMaintenanceOpen(false)}
                  className="h-9 px-4 rounded-xl border border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] font-semibold transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={performSave}
                  className="h-9 px-4 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white font-semibold transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Enable &amp; Save Settings
                </button>
              </div>
            </div>
          </Modal>
        </form>
      )}
    </div>
  );
};
