import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  Sliders,
  CreditCard,
  Bell,
  ShieldCheck,
  Server,
  RefreshCw,
  Database,
  Download,
  Upload,
  Sun,
  Moon,
  LogOut,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  ServerAppConfig,
  CatalogInspection,
  UserProfile,
  UserPreferences,
  CreditLedgerState,
} from '../types/index.js';
import { checkServerHealth, refreshVoiceCatalog } from '../services/api.js';
import {
  clearGenerationHistory,
  saveFavorites,
  exportWorkspaceBackup,
  importWorkspaceBackup,
} from '../services/storage.js';
import { Toggle } from '../components/ui/index.js';
import { useToast } from '../context/ToastContext.js';
import { GoogleLogoSvg } from '../components/GoogleSignInModal.js';

interface SettingsViewProps {
  config: ServerAppConfig;
  inspection: CatalogInspection | null;
  favoritesCount: number;
  historyCount: number;
  projectsCount: number;
  profile: UserProfile;
  preferences: UserPreferences;
  credits: CreditLedgerState;
  onUpdateProfile: (profile: UserProfile) => void;
  onUpdatePreferences: (prefs: UserPreferences) => void;
  onOpenPlans: () => void;
  onRefreshCatalog: () => void;
  onFavoritesCleared: () => void;
  onHistoryCleared: () => void;
  onWorkspaceRestored: () => void;
  onSignOut: () => void;
  isSignedIn?: boolean;
  onOpenSignIn?: () => void;
}

type SettingsSection = 'general' | 'billing' | 'security' | 'system';

export const SettingsView: React.FC<SettingsViewProps> = ({
  config,
  inspection,
  favoritesCount,
  historyCount,
  projectsCount,
  profile,
  preferences,
  credits,
  onUpdateProfile,
  onUpdatePreferences,
  onOpenPlans,
  onRefreshCatalog,
  onFavoritesCleared,
  onHistoryCleared,
  onWorkspaceRestored,
  onSignOut,
  isSignedIn = false,
  onOpenSignIn,
}) => {
  const { showToast } = useToast();
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');

  // Local draft forms for Profile & Preferences
  const [draftProfile, setDraftProfile] = useState<UserProfile>(profile);
  const [draftPrefs, setDraftPrefs] = useState<UserPreferences>(preferences);

  useEffect(() => {
    setDraftProfile(profile);
  }, [profile]);

  useEffect(() => {
    setDraftPrefs(preferences);
  }, [preferences]);

  // API Health & Catalog state
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Confirm states (no window.confirm inside iframe)
  const [confirmClearFavs, setConfirmClearFavs] = useState(false);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const testConnection = async (notify = false) => {
    setIsCheckingHealth(true);
    try {
      const res = await checkServerHealth();
      setHealthStatus(res);
      if (notify) {
        showToast(
          res.status === 'ok' ? 'Provider connection verified' : res.message || 'Status degraded',
          res.status === 'ok' ? 'success' : 'warning'
        );
      }
    } catch (err: any) {
      setHealthStatus({ status: 'error', message: err.message });
      if (notify) showToast(err.message || 'Health check failed', 'error');
    } finally {
      setIsCheckingHealth(false);
    }
  };

  useEffect(() => {
    testConnection(false);
  }, []);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftProfile.displayName.trim()) {
      showToast('Display name cannot be empty.', 'warning');
      return;
    }
    onUpdateProfile({
      ...draftProfile,
      displayName: draftProfile.displayName.trim(),
      email: draftProfile.email.trim(),
      role: draftProfile.role.trim(),
    });
    showToast('Profile saved', 'success');
  };

  const handleSavePrefs = () => {
    onUpdatePreferences(draftPrefs);
    showToast('Studio preferences updated', 'success');
  };

  const handleExportBackup = () => {
    const backup = exportWorkspaceBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `speakly-studio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Workspace JSON backup exported', 'success');
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid JSON structure');
        }
        importWorkspaceBackup(parsed);
        onWorkspaceRestored();
        showToast('Workspace backup restored successfully', 'success');
      } catch (err: any) {
        showToast(err.message || 'Could not parse backup JSON file', 'error');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleRefreshCatalog = async () => {
    setIsRefreshing(true);
    try {
      const res = await refreshVoiceCatalog();
      onRefreshCatalog();
      showToast(res.message || 'Voice catalog refreshed', 'success');
    } catch (err: any) {
      showToast(err.message || 'Refresh failed', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const creditUsagePercent = Math.min(
    100,
    Math.round((credits.remainingCredits / Math.max(1, credits.monthlyAllowance)) * 100)
  );

  const sectionTabs: { id: SettingsSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'general', label: 'Profile & Preferences', icon: User },
    { id: 'billing', label: 'Billing & Credits', icon: CreditCard },
    { id: 'security', label: 'Notifications & Security', icon: ShieldCheck },
    { id: 'system', label: 'Backup & Provider API', icon: Server },
  ];

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[#11162B] dark:text-[#F3F5FA]">
            Settings
          </h1>
          <p className="text-xs sm:text-sm text-[#5A6580] dark:text-[#A2ADC7] mt-0.5">
            Manage profile details, studio defaults, billing credits, workspace JSON backups, and API diagnostics.
          </p>
        </div>

        {isSignedIn ? (
          <button
            type="button"
            onClick={onSignOut}
            className="h-9 px-3.5 rounded-xl border border-[#E4E7EF] dark:border-[#1E2638] bg-white dark:bg-[#101521] hover:border-[#DC2626] text-xs font-semibold text-[#DC2626] dark:text-[#F87171] flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        ) : (
          onOpenSignIn && (
            <button
              type="button"
              onClick={onOpenSignIn}
              className="h-9 px-4 rounded-xl border border-[#CFD6E6] dark:border-[#2C364F] bg-white dark:bg-[#101521] hover:border-[#2E5BFF] dark:hover:border-[#4D74FF] text-xs font-bold text-[#11162B] dark:text-[#F3F5FA] flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
            >
              <GoogleLogoSvg className="w-3.5 h-3.5 shrink-0" />
              <span>Continue with Google</span>
            </button>
          )
        )}
      </div>

      {/* Section Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {sectionTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`h-9 px-4 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/30 ${
                active
                  ? 'bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] border border-[#2E5BFF]/30 dark:border-[#4D74FF]/30'
                  : 'bg-white dark:bg-[#101521] text-[#5A6580] dark:text-[#A2ADC7] border border-[#E4E7EF] dark:border-[#1E2638] hover:text-[#11162B] dark:hover:text-[#F3F5FA]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SECTION 1: PROFILE & PREFERENCES */}
      {activeSection === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Profile Settings */}
          <form
            onSubmit={handleSaveProfile}
            className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-center justify-between gap-2.5 pb-3 border-b border-[#E4E7EF] dark:border-[#1E2638]">
              <div className="flex items-center gap-2.5">
                <User className="w-4 h-4 text-[#2E5BFF] dark:text-[#7A9AFF]" />
                <h2 className="font-display text-sm font-bold text-[#11162B] dark:text-[#F3F5FA]">
                  Profile Details
                </h2>
              </div>
              <span className="text-[11px] font-semibold text-[#5A6580] dark:text-[#A2ADC7]">
                {isSignedIn ? 'Verified Google Account' : 'Guest Mode · 0 Credits'}
              </span>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={draftProfile.displayName}
                  onChange={(e) => setDraftProfile({ ...draftProfile, displayName: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:bg-white dark:focus:bg-[#101521] focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={draftProfile.email}
                  onChange={(e) => setDraftProfile({ ...draftProfile, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:bg-white dark:focus:bg-[#101521] focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">
                  Studio Role
                </label>
                <input
                  type="text"
                  value={draftProfile.role}
                  onChange={(e) => setDraftProfile({ ...draftProfile, role: e.target.value })}
                  placeholder="e.g. Creative Producer"
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:bg-white dark:focus:bg-[#101521] focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="h-9 px-4 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                Save Profile
              </button>
            </div>
          </form>

          {/* Studio Preferences */}
          <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-[#E4E7EF] dark:border-[#1E2638]">
              <Sliders className="w-4 h-4 text-[#2E5BFF] dark:text-[#7A9AFF]" />
              <h2 className="font-display text-sm font-bold text-[#11162B] dark:text-[#F3F5FA]">
                Studio Preferences
              </h2>
            </div>

            <div className="space-y-4">
              {/* Theme Selector */}
              <div>
                <span className="block text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-2">
                  Appearance Mode
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setDraftPrefs({ ...draftPrefs, theme: 'light' })}
                    className={`h-10 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      draftPrefs.theme === 'light'
                        ? 'bg-[#EEF2FF] border-[#2E5BFF] text-[#2E5BFF]'
                        : 'bg-[#F7F8FA] dark:bg-[#0D121D] border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7]'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>Light Default</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftPrefs({ ...draftPrefs, theme: 'dark' })}
                    className={`h-10 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      draftPrefs.theme === 'dark'
                        ? 'bg-[#4D74FF]/14 border-[#4D74FF] text-[#7A9AFF]'
                        : 'bg-[#F7F8FA] dark:bg-[#0D121D] border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7]'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>Dark Studio</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">
                    Default Language
                  </label>
                  <select
                    value={draftPrefs.defaultLanguage}
                    onChange={(e) => setDraftPrefs({ ...draftPrefs, defaultLanguage: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                  >
                    {['English', 'Spanish', 'French', 'German', 'Japanese', 'Portuguese', 'Italian'].map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">
                    Preferred Export Label
                  </label>
                  <select
                    value={draftPrefs.defaultFormat}
                    onChange={(e) =>
                      setDraftPrefs({ ...draftPrefs, defaultFormat: e.target.value as 'mp3' | 'wav' })
                    }
                    className="w-full px-3.5 py-2.5 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                  >
                    <option value="mp3">MP3 (Standard)</option>
                    <option value="wav">WAV (When upstream provides)</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-[#11162B] dark:text-[#F3F5FA]">Default Pacing / Speed</span>
                  <span className="font-mono tabular-nums font-bold text-[#2E5BFF] dark:text-[#7A9AFF]">
                    {draftPrefs.defaultSpeed.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={draftPrefs.defaultSpeed}
                  onChange={(e) =>
                    setDraftPrefs({ ...draftPrefs, defaultSpeed: parseFloat(e.target.value) })
                  }
                  className="studio-slider w-full h-1.5 bg-[#E4E7EF] dark:bg-[#1E2638] rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono tabular-nums text-[#78839E] dark:text-[#7C87A3] mt-1">
                  <span>0.5x</span>
                  <span>1.0x</span>
                  <span>1.5x</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                    Word-Aligned Transcript Session Default
                  </div>
                  <p className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] leading-relaxed">
                    Always starts OFF for new speech sessions. Saved projects preserve their own transcript setting.
                  </p>
                </div>
                <span className="font-mono text-[11px] font-semibold text-[#5A6580] dark:text-[#A2ADC7] shrink-0">
                  OFF by default
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleSavePrefs}
                className="h-9 px-4 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                Apply Preferences
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: BILLING & CREDITS */}
      {activeSection === 'billing' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-[#2E5BFF] dark:text-[#7A9AFF]">
                  Active Tier
                </span>
                <h2 className="font-display text-lg font-bold text-[#11162B] dark:text-[#F3F5FA] mt-0.5">
                  {credits.planName} Plan
                </h2>
              </div>
              <button
                type="button"
                onClick={onOpenPlans}
                className="h-9 px-3.5 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Explore Plans</span>
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#EEF2FF]/70 dark:bg-[#4D74FF]/12 space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-[#5A6580] dark:text-[#A2ADC7]">
                  Remaining Credits
                </span>
                <span className="text-2xl font-bold font-mono tabular-nums text-[#11162B] dark:text-[#F3F5FA]">
                  {credits.remainingCredits.toLocaleString()}
                </span>
              </div>
              <div className="h-2 rounded-full bg-white dark:bg-[#0D121D] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#2E5BFF] dark:bg-[#4D74FF] transition-all duration-300"
                  style={{ width: `${creditUsagePercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-[#5A6580] dark:text-[#A2ADC7] font-mono tabular-nums">
                <span>Monthly limit: {credits.monthlyAllowance.toLocaleString()}</span>
                <span>{creditUsagePercent}% left</span>
              </div>
            </div>

            <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] leading-relaxed">
              Speakly Studio deducts <span className="font-mono font-semibold text-[#11162B] dark:text-[#F3F5FA]">1 credit per trimmed character</span> for audio generation, plus <span className="font-mono font-semibold text-[#11162B] dark:text-[#F3F5FA]">25% (rounded up)</span> when Word-Aligned Transcript is enabled.
            </p>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E7EF] dark:border-[#1E2638]">
              <h2 className="font-display text-sm font-bold text-[#11162B] dark:text-[#F3F5FA]">
                Credit Usage Ledger
              </h2>
              <span className="text-xs font-mono tabular-nums text-[#5A6580] dark:text-[#A2ADC7]">
                {credits.events.length} entries
              </span>
            </div>

            <div className="divide-y divide-[#E4E7EF] dark:divide-[#1E2638] max-h-80 overflow-y-auto">
              {credits.events.map((ev) => (
                <div key={ev.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#11162B] dark:text-[#F3F5FA] truncate">
                      {ev.label}
                    </div>
                    <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] font-mono tabular-nums">
                      {ev.voiceName ? `${ev.voiceName} · ` : ''}
                      {new Date(ev.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <span
                    className={`font-mono tabular-nums font-bold shrink-0 ${
                      ev.amount >= 0 ? 'text-[#16A34A] dark:text-[#22C55E]' : 'text-[#11162B] dark:text-[#F3F5FA]'
                    }`}
                  >
                    {ev.amount >= 0 ? `+${ev.amount.toLocaleString()}` : ev.amount.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: NOTIFICATIONS & SECURITY */}
      {activeSection === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Notification Preferences */}
          <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-[#E4E7EF] dark:border-[#1E2638]">
              <Bell className="w-4 h-4 text-[#2E5BFF] dark:text-[#7A9AFF]" />
              <h2 className="font-display text-sm font-bold text-[#11162B] dark:text-[#F3F5FA]">
                Notification Preferences
              </h2>
            </div>

            <div className="divide-y divide-[#E4E7EF] dark:divide-[#1E2638]">
              <div className="pb-4">
                <Toggle
                  id="notif-complete-toggle"
                  checked={draftPrefs.notifyOnComplete}
                  onChange={(checked) => {
                    const updated = { ...draftPrefs, notifyOnComplete: checked };
                    setDraftPrefs(updated);
                    onUpdatePreferences(updated);
                  }}
                  label="Speech Generation Alerts"
                  description="Log completion alerts to the header notification bell when audio is ready."
                />
              </div>

              <div className="pt-4">
                <Toggle
                  id="notif-account-toggle"
                  checked={draftPrefs.notifyAccountAlerts}
                  onChange={(checked) => {
                    const updated = { ...draftPrefs, notifyAccountAlerts: checked };
                    setDraftPrefs(updated);
                    onUpdatePreferences(updated);
                  }}
                  label="Credit & Plan Alerts"
                  description="Receive alerts on plan upgrades or low credit thresholds."
                />
              </div>
            </div>
          </div>

          {/* Google Account & Speech Authorization */}
          <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E7EF] dark:border-[#1E2638]">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#2E5BFF] dark:text-[#7A9AFF]" />
                <h2 className="font-display text-sm font-bold text-[#11162B] dark:text-[#F3F5FA]">
                  Account Security & Authorization
                </h2>
              </div>
              {isSignedIn ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#16A34A] dark:text-[#22C55E]">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Google Verified</span>
                </span>
              ) : (
                <span className="text-xs font-semibold text-[#5A6580] dark:text-[#A2ADC7]">
                  Sign-In Required
                </span>
              )}
            </div>

            {isSignedIn ? (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] space-y-1">
                  <div className="text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                    Authenticated Google Session
                  </div>
                  <p className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] leading-relaxed">
                    Signed in as <span className="font-semibold text-[#11162B] dark:text-[#F3F5FA]">{profile.email}</span>. Audio generation is unlocked automatically using your credit balance (<span className="font-mono tabular-nums">{credits.remainingCredits.toLocaleString()}</span> credits available).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="h-9 px-4 rounded-xl border border-[#E4E7EF] dark:border-[#1E2638] hover:border-[#DC2626]/50 text-xs font-semibold text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#DC2626] dark:hover:text-[#F87171] inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out of Google Account</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] leading-relaxed">
                  Speech synthesis requires an authenticated Google account with available credits. No access code or manual unlock is needed once signed in.
                </p>
                {onOpenSignIn && (
                  <button
                    type="button"
                    onClick={onOpenSignIn}
                    className="w-full h-10 px-4 rounded-xl bg-white dark:bg-[#0D121D] border border-[#CFD6E6] dark:border-[#2C364F] hover:border-[#2E5BFF] dark:hover:border-[#4D74FF] text-xs font-bold text-[#11162B] dark:text-[#F3F5FA] flex items-center justify-center gap-2 whitespace-nowrap transition-colors cursor-pointer"
                  >
                    <GoogleLogoSvg className="w-4 h-4 shrink-0" />
                    <span>Continue with Google</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 4: BACKUP & PROVIDER API */}
      {activeSection === 'system' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Workspace Backup & Local Data */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-[#E4E7EF] dark:border-[#1E2638]">
                <Database className="w-4 h-4 text-[#2E5BFF] dark:text-[#7A9AFF]" />
                <h2 className="font-display text-sm font-bold text-[#11162B] dark:text-[#F3F5FA]">
                  Workspace JSON Backup & Storage
                </h2>
              </div>

              <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] leading-relaxed">
                Export or restore all browser-persisted studio data (<span className="font-mono tabular-nums">{projectsCount}</span> projects, <span className="font-mono tabular-nums">{favoritesCount}</span> favorites, <span className="font-mono tabular-nums">{historyCount}</span> history entries, credits ledger, and profile preferences).
              </p>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="h-9 px-4 rounded-xl bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] hover:bg-[#2E5BFF] hover:text-white dark:hover:bg-[#4D74FF] dark:hover:text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export JSON Backup</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportBackup}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-9 px-4 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] hover:border-[#2E5BFF] dark:hover:border-[#4D74FF] text-[#11162B] dark:text-[#F3F5FA] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import JSON Backup</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-[#11162B] dark:text-[#F3F5FA]">
                      Favorite Voices
                    </div>
                    <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] font-mono tabular-nums">
                      {favoritesCount} saved
                    </div>
                  </div>
                  {confirmClearFavs ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          saveFavorites([]);
                          onFavoritesCleared();
                          setConfirmClearFavs(false);
                          showToast('Favorites cleared', 'info');
                        }}
                        className="px-2 py-1 rounded-lg bg-[#DC2626] text-white text-[11px] font-semibold cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearFavs(false)}
                        className="px-2 py-1 text-[11px] text-[#5A6580] dark:text-[#A2ADC7] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={favoritesCount === 0}
                      onClick={() => setConfirmClearFavs(true)}
                      className="p-2 rounded-lg text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#DC2626] dark:hover:text-[#F87171] disabled:opacity-40 cursor-pointer"
                      title="Clear favorites"
                      aria-label="Clear favorites"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-[#11162B] dark:text-[#F3F5FA]">
                      Speech History
                    </div>
                    <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] font-mono tabular-nums">
                      {historyCount} entries
                    </div>
                  </div>
                  {confirmClearHistory ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          clearGenerationHistory();
                          onHistoryCleared();
                          setConfirmClearHistory(false);
                          showToast('Generation history cleared', 'info');
                        }}
                        className="px-2 py-1 rounded-lg bg-[#DC2626] text-white text-[11px] font-semibold cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearHistory(false)}
                        className="px-2 py-1 text-[11px] text-[#5A6580] dark:text-[#A2ADC7] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={historyCount === 0}
                      onClick={() => setConfirmClearHistory(true)}
                      className="p-2 rounded-lg text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#DC2626] dark:hover:text-[#F87171] disabled:opacity-40 cursor-pointer"
                      title="Clear history"
                      aria-label="Clear history"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Backend Health & Voice Catalog Telemetry */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#E4E7EF] dark:border-[#1E2638]">
                <div className="flex items-center gap-2.5">
                  <Server className="w-4 h-4 text-[#2E5BFF] dark:text-[#7A9AFF]" />
                  <h2 className="font-display text-sm font-bold text-[#11162B] dark:text-[#F3F5FA]">
                    Provider Health & Catalog Telemetry
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => testConnection(true)}
                    disabled={isCheckingHealth}
                    className="h-8 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] hover:border-[#2E5BFF] text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCheckingHealth ? 'animate-spin text-[#2E5BFF] dark:text-[#7A9AFF]' : ''}`} />
                    <span>Test</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRefreshCatalog}
                    disabled={isRefreshing}
                    className="h-8 px-3 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>Re-fetch Catalog</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] flex items-center justify-between">
                  <span className="text-[#5A6580] dark:text-[#A2ADC7]">OpenSpeaker Key</span>
                  <span className={`font-semibold ${config.isConfigured ? 'text-[#16A34A] dark:text-[#22C55E]' : 'text-[#D97706] dark:text-[#F59E0B]'}`}>
                    {config.isConfigured ? 'Configured' : 'Missing Key'}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] flex items-center justify-between">
                  <span className="text-[#5A6580] dark:text-[#A2ADC7]">API Health</span>
                  <span className="font-mono font-semibold capitalize text-[#11162B] dark:text-[#F3F5FA]">
                    {healthStatus?.status || 'Active'}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] flex items-center justify-between">
                  <span className="text-[#5A6580] dark:text-[#A2ADC7]">Upstream Host</span>
                  <span className="font-mono text-[#11162B] dark:text-[#F3F5FA] truncate max-w-[150px]">
                    {config.apiBaseUrl}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] flex items-center justify-between">
                  <span className="text-[#5A6580] dark:text-[#A2ADC7]">Script Limit</span>
                  <span className="font-mono tabular-nums font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                    {isSignedIn
                      ? `${credits.remainingCredits.toLocaleString()} chars (1:1)`
                      : '5,000 guest preview'}
                  </span>
                </div>
              </div>

              {inspection && (
                <div className="space-y-3 pt-1 text-xs">
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="p-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D]">
                      <div className="text-[#5A6580] dark:text-[#A2ADC7] text-[11px]">Voices Cached</div>
                      <div className="text-base font-bold font-mono tabular-nums text-[#11162B] dark:text-[#F3F5FA]">
                        {inspection.totalVoices.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D]">
                      <div className="text-[#5A6580] dark:text-[#A2ADC7] text-[11px]">Languages</div>
                      <div className="text-base font-bold font-mono tabular-nums text-[#11162B] dark:text-[#F3F5FA]">
                        {inspection.discoveredLanguages.length}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D]">
                      <div className="text-[#5A6580] dark:text-[#A2ADC7] text-[11px]">Accents</div>
                      <div className="text-base font-bold font-mono tabular-nums text-[#11162B] dark:text-[#F3F5FA]">
                        {inspection.discoveredAccents.length}
                      </div>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D]">
                    <div className="font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">
                      Discovered Record Schema
                    </div>
                    <p className="font-mono text-[11px] text-[#5A6580] dark:text-[#A2ADC7] break-words">
                      {inspection.sampleRecordKeys.join(', ') || 'No fields detected'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
