import React, { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { ShieldAlert, Lock } from 'lucide-react';
import {
  NavTab,
  Voice,
  CatalogInspection,
  ServerAppConfig,
  GenerationHistoryItem,
  Project,
  CreditLedgerState,
  UserProfile,
  UserPreferences,
  AppNotification,
} from './types/index.js';
import { fetchServerConfig, fetchVoicesPage, refreshVoiceCatalog } from './services/api.js';
import { getCachedVoicesByIds, invalidateClientVoiceCache } from './services/voiceCache.js';
import {
  getSavedFavorites,
  toggleFavoriteVoice,
  getGenerationHistory,
  removeHistoryItem,
  clearGenerationHistory,
  getRecentVoiceIds,
  getSavedProjects,
  saveProjects,
  GUEST_DEFAULT_CREDITS,
  GUEST_DEFAULT_PROFILE,
  GUEST_DEFAULT_NOTIFICATIONS,
  saveCreditLedger,
  getUserProfile,
  saveUserProfile,
  getUserPreferences,
  saveUserPreferences,
  saveNotifications,
  resetLocalSession,
  clearLegacyAccessCodeStorage,
  getWelcomeOfferDismissed,
  dismissWelcomeOffer,
} from './services/storage.js';
import {
  auth,
  signInWithGoogle,
  signOutFirebase,
} from './firebase.js';
import {
  fetchPublicBootstrap,
  syncSignedInUser,
  saveSyncedProject,
  deleteSyncedProject,
  updateSyncedProfile,
  markAllUserNotificationsRead,
  PublicPricingPlan,
  PublicPlatformSettings,
  UserPaymentRequestItem,
} from './services/userSyncApi.js';
import { AudioPlayerProvider } from './context/AudioPlayerContext.js';
import { ToastProvider, useToast } from './context/ToastContext.js';
import { Sidebar } from './components/Sidebar.js';
import { TopHeader } from './components/TopHeader.js';
import { GlobalMiniPlayer } from './components/GlobalMiniPlayer.js';
import { VoiceSelectorModal } from './components/VoiceSelectorModal.js';
import { PlansModal, ShortcutsModal, HelpDocsModal } from './components/Modals.js';
import { CheckoutModal } from './components/CheckoutModal.js';
import { GoogleSignInModal } from './components/GoogleSignInModal.js';
import { CreateSpeechView } from './views/CreateSpeechView.js';
import { VoiceLibraryView } from './views/VoiceLibraryView.js';
import { FavoritesView } from './views/FavoritesView.js';
import { HistoryView } from './views/HistoryView.js';
import { ProjectsView } from './views/ProjectsView.js';
import { SettingsView } from './views/SettingsView.js';
import { AdminApp } from './admin/AdminApp.js';

const DEFAULT_SETTINGS: PublicPlatformSettings = {
  siteName: 'Speakly Studio',
  logoUrl: '',
  faviconUrl: '',
  supportEmail: 'support@speaklystudio.ai',
  contactInfo: '',
  defaultCredits: 0,
  signupBonusEnabled: true,
  signupBonusCredits: 5000,
  defaultPlanId: 'plan_starter',
  allowRegistration: true,
  creditCostPer1kChars: 1000,
  transcriptSurchargePercent: 25,
  paymentInstructions:
    'Send the exact plan amount via your selected payment method and enter your Transaction ID below.',
  acceptedPaymentMethods: ['Bank Transfer', 'Wise', 'PayPal', 'USDT (TRC20)', 'Card / Invoice'],
  maxTextChars: 50000,
  supportedLanguages: ['English'],
  maintenanceMode: false,
  maintenanceMessage: 'Speakly Studio is currently undergoing scheduled maintenance.',
};

function SpeaklyStudioShell() {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<NavTab>('create');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('speakly_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const [config, setConfig] = useState<ServerAppConfig>({
    isConfigured: false,
    apiBaseUrl: 'https://api.ai33.pro',
    maxTextChars: 50000,
  });

  // Platform Bootstrap State
  const [platformPlans, setPlatformPlans] = useState<PublicPricingPlan[]>([]);
  const [platformSettings, setPlatformSettings] = useState<PublicPlatformSettings>(DEFAULT_SETTINGS);

  // Firebase User Auth State (Optional Sign-In with Guest Studio Fallback)
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userPayments, setUserPayments] = useState<UserPaymentRequestItem[]>([]);

  const [voices, setVoices] = useState<Voice[]>([]);
  const [inspection, setInspection] = useState<CatalogInspection | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);

  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => getSavedFavorites());
  const [recentIds, setRecentIds] = useState<string[]>(() => getRecentVoiceIds());
  const [history, setHistory] = useState<GenerationHistoryItem[]>(() => getGenerationHistory());
  const [projects, setProjects] = useState<Project[]>(() => getSavedProjects());
  const [credits, setCredits] = useState<CreditLedgerState>(() => GUEST_DEFAULT_CREDITS);
  const [profile, setProfile] = useState<UserProfile>(() => GUEST_DEFAULT_PROFILE);
  const [preferences, setPreferences] = useState<UserPreferences>(() => getUserPreferences());
  const [notifications, setNotifications] = useState<AppNotification[]>(() => GUEST_DEFAULT_NOTIFICATIONS);

  // Studio script & active project handoff
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [editorSeed, setEditorSeed] = useState<{
    script: string;
    speed?: number;
    withTranscript?: boolean;
    isProjectSession?: boolean;
    key: number;
  } | null>(null);

  // Modals
  const [isVoiceSelectorOpen, setIsVoiceSelectorOpen] = useState(false);
  const [isPlansOpen, setIsPlansOpen] = useState(false);
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [welcomeOfferDismissed, setWelcomeOfferDismissed] = useState<boolean>(() =>
    getWelcomeOfferDismissed()
  );
  const explicitSignInRef = useRef(false);
  const [checkoutState, setCheckoutState] = useState<{
    isOpen: boolean;
    plan: PublicPricingPlan | null;
    billingCycle: 'monthly' | 'yearly';
  }>({ isOpen: false, plan: null, billingCycle: 'monthly' });
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [helpModalState, setHelpModalState] = useState<{
    isOpen: boolean;
    section: 'support' | 'docs';
  }>({ isOpen: false, section: 'docs' });

  // Sync light/dark class on <html>
  useEffect(() => {
    if (preferences.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [preferences.theme]);

  // Apply dynamic document title / favicon from Admin Platform Settings
  useEffect(() => {
    if (platformSettings.siteName) {
      document.title = `${platformSettings.siteName} — AI Speech Workstation`;
    }
    if (platformSettings.faviconUrl) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = platformSettings.faviconUrl;
    }
  }, [platformSettings.siteName, platformSettings.faviconUrl]);

  // Hydrate authenticated user from DB
  const hydrateSignedInUser = useCallback(async () => {
    try {
      const localProjects = getSavedProjects();
      const synced = await syncSignedInUser(localProjects);
      setIsSignedIn(true);
      setIsSignInModalOpen(false);
      setSignInError(null);

      setProfile({
        displayName: synced.user.displayName,
        email: synced.user.email,
        role: `${synced.user.planName} Member`,
        avatarUrl: synced.user.avatarUrl,
      });

      const activePlanObj = platformPlans.find((p) => p.name === synced.user.planName);
      setCredits({
        planName: synced.user.planName || 'Starter',
        monthlyAllowance: activePlanObj?.credits || Math.max(5000, synced.user.remainingCredits),
        remainingCredits: synced.user.remainingCredits,
        events: synced.creditTransactions.map((tx: any) => ({
          id: tx.id,
          label: tx.reason,
          amount: tx.amount,
          createdAt: tx.createdAt,
        })),
      });

      if (Array.isArray(synced.projects) && synced.projects.length > 0) {
        setProjects(synced.projects);
      }
      setUserPayments(synced.paymentRequests || []);
      if (Array.isArray(synced.notifications)) {
        setNotifications(synced.notifications);
      }

      if (synced.bonusAwarded) {
        showToast(
          synced.welcomeMessage ||
            "Welcome to Speakly Studio! You've received 5,000 free credits. Start creating amazing AI voices!",
          'success',
          `${(synced.bonusAmount || 5000).toLocaleString()} Welcome Credits Added`
        );
      } else if (explicitSignInRef.current) {
        showToast(
          `Signed in as ${synced.user.displayName}. Balance: ${synced.user.remainingCredits.toLocaleString()} credits.`,
          'success',
          'Welcome Back'
        );
      }
      explicitSignInRef.current = false;
    } catch (err: any) {
      explicitSignInRef.current = false;
      const msg = err.message || 'Could not sync user account.';
      setSignInError(msg);
      showToast(msg, 'error');
      await signOutFirebase().catch(() => undefined);
      setIsSignedIn(false);
      setCredits(GUEST_DEFAULT_CREDITS);
      setProfile(GUEST_DEFAULT_PROFILE);
      setNotifications(GUEST_DEFAULT_NOTIFICATIONS);
    }
  }, [platformPlans, showToast]);

  // Listen for Firebase Auth state changes
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        void hydrateSignedInUser();
      } else {
        setIsSignedIn(false);
        setUserPayments([]);
        setCredits(GUEST_DEFAULT_CREDITS);
        setProfile(GUEST_DEFAULT_PROFILE);
        setNotifications(GUEST_DEFAULT_NOTIFICATIONS);
      }
    });
    return () => unsub();
  }, [hydrateSignedInUser]);

  const handleToggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('speakly_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleToggleTheme = () => {
    setPreferences((prev) => {
      const next: UserPreferences = {
        ...prev,
        theme: prev.theme === 'dark' ? 'light' : 'dark',
      };
      saveUserPreferences(next);
      return next;
    });
  };

  const handleUpdatePreferences = (nextPrefs: UserPreferences) => {
    setPreferences(nextPrefs);
    saveUserPreferences(nextPrefs);
    if (isSignedIn) {
      void updateSyncedProfile({
        defaultLanguage: nextPrefs.defaultLanguage,
        defaultSpeed: nextPrefs.defaultSpeed,
        notifyOnComplete: nextPrefs.notifyOnComplete,
        notifyAccountAlerts: nextPrefs.notifyAccountAlerts,
      }).catch(() => undefined);
    }
  };

  const handleUpdateProfile = (nextProfile: UserProfile) => {
    setProfile(nextProfile);
    saveUserProfile(nextProfile);
    if (isSignedIn) {
      void updateSyncedProfile({
        displayName: nextProfile.displayName,
      }).catch(() => undefined);
    }
  };

  const hydrationPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [totalVoiceCount, setTotalVoiceCount] = useState<number>(0);

  // Load config, bootstrap settings/plans, & slim Page-1 voices catalog
  const loadInitialData = useCallback(async (forceRefresh = false) => {
    if (hydrationPollTimerRef.current) {
      clearTimeout(hydrationPollTimerRef.current);
      hydrationPollTimerRef.current = null;
    }

    try {
      const [cfg, boot] = await Promise.all([
        fetchServerConfig(),
        fetchPublicBootstrap().catch(() => null),
      ]);

      setConfig(cfg);
      if (boot) {
        setPlatformPlans(boot.plans);
        setPlatformSettings(boot.settings);
      }

      if (cfg.isConfigured) {
        setIsLoadingVoices(true);
        try {
          if (forceRefresh) {
            invalidateClientVoiceCache();
            const refreshed = await refreshVoiceCatalog();
            setVoices(refreshed.voices || []);
            setInspection(refreshed.inspection);
            setTotalVoiceCount(refreshed.totalCatalog || refreshed.inspection?.totalVoices || 0);
            if (refreshed.degraded && refreshed.warning) {
              showToast(refreshed.warning, 'warning', 'Partial Voice Catalog');
            } else {
              showToast(refreshed.message || 'Voice catalog synced.', 'success');
            }
          } else {
            const page1 = await fetchVoicesPage({ page: 1, limit: 24 });
            setVoices(page1.items);
            setInspection(page1.inspection);
            setTotalVoiceCount(page1.totalCatalog || page1.inspection?.totalVoices || page1.items.length);

            if (page1.degraded && page1.warning) {
              showToast(page1.warning, 'warning', 'Partial Voice Catalog');
            }

            // If server was still warming pages 2..30 on cold boot, refresh slim Page 1 + total count once ready
            if (page1.hydrating) {
              const scheduleSync = () => {
                hydrationPollTimerRef.current = setTimeout(async () => {
                  try {
                    const fresh = await fetchVoicesPage({
                      page: 1,
                      limit: 24,
                      bypassClientCache: true,
                    });
                    setVoices(fresh.items);
                    setInspection(fresh.inspection);
                    setTotalVoiceCount(fresh.totalCatalog || fresh.inspection?.totalVoices || fresh.items.length);
                    if (fresh.hydrating) {
                      scheduleSync();
                    }
                  } catch {
                    // ignore background check error
                  }
                }, 2500);
              };
              scheduleSync();
            }
          }
        } catch (err: any) {
          console.error('Failed to fetch voices catalog', err);
          showToast(
            err.message || 'Voice catalog is temporarily busy. Please try refreshing in a moment.',
            'warning'
          );
        } finally {
          setIsLoadingVoices(false);
        }
      }
    } catch (err: any) {
      console.error('Failed to load initial server configuration', err);
    }
  }, [showToast]);

  useEffect(() => {
    clearLegacyAccessCodeStorage();
    void loadInitialData();
    return () => {
      if (hydrationPollTimerRef.current) {
        clearTimeout(hydrationPollTimerRef.current);
      }
    };
  }, [loadInitialData]);

  // Favorites
  const handleToggleFavorite = useCallback(
    (voiceId: string) => {
      const isAdded = toggleFavoriteVoice(voiceId);
      setFavoriteIds(getSavedFavorites());
      const voice =
        voices.find((v) => v.id === voiceId) || getCachedVoicesByIds([voiceId]).found[0];
      const name = voice?.name || 'Voice';
      showToast(
        isAdded ? `Added ${name} to favorites` : `Removed ${name} from favorites`,
        'info'
      );
    },
    [voices, showToast]
  );

  // Voice Selection
  const handleSelectVoice = useCallback(
    (voice: Voice) => {
      setSelectedVoice(voice);
      setRecentIds(getRecentVoiceIds());
      showToast(`Active voice set to "${voice.name}"`, 'info');
    },
    [showToast]
  );

  const handleOpenVoiceSelector = useCallback(() => setIsVoiceSelectorOpen(true), []);
  const handleCloseVoiceSelector = useCallback(() => setIsVoiceSelectorOpen(false), []);

  // Generation Complete -> Refresh DB-backed Credits, History, and Notifications
  const handleGenerationComplete = (item: GenerationHistoryItem) => {
    setHistory(getGenerationHistory());
    setRecentIds(getRecentVoiceIds());

    if (isSignedIn) {
      void hydrateSignedInUser();
    }
  };

  // History management
  const handleRemoveHistoryItem = (id: string) => {
    removeHistoryItem(id);
    setHistory(getGenerationHistory());
    showToast('Record removed from history', 'info');
  };

  const handleClearHistory = () => {
    clearGenerationHistory();
    setHistory([]);
  };

  // Projects management
  const handleCreateOrUpdateProject = (project: Project, isNew: boolean) => {
    setProjects((prev) => {
      const next = isNew
        ? [project, ...prev]
        : prev.map((p) => (p.id === project.id ? project : p));
      saveProjects(next);
      return next;
    });
    if (isSignedIn) {
      void saveSyncedProject(project).catch(() => undefined);
    }
    showToast(isNew ? `Created project "${project.name}"` : `Updated "${project.name}"`, 'success');
  };

  const handleDeleteProject = (id: string) => {
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveProjects(next);
      return next;
    });
    if (isSignedIn) {
      void deleteSyncedProject(id).catch(() => undefined);
    }
    if (activeProject?.id === id) setActiveProject(null);
    showToast('Project deleted', 'info');
  };

  const handleOpenProjectInStudio = (proj: Project) => {
    setActiveProject(proj);
    setEditorSeed({
      script: proj.script,
      speed: proj.speed,
      withTranscript: Boolean(proj.withTranscript),
      isProjectSession: true,
      key: Date.now(),
    });
    if (proj.voiceId) {
      const match = voices.find((v) => v.id === proj.voiceId);
      if (match) setSelectedVoice(match);
    }
    setActiveTab('create');
    showToast(`Opened "${proj.name}" in studio`, 'success');
  };

  const handleSaveToProjectFromStudio = (payload: {
    name: string;
    description: string;
    script: string;
    voiceId?: string;
    voiceName?: string;
    speed: number;
    withTranscript: boolean;
    fileName?: string;
  }) => {
    const now = new Date().toISOString();
    const existing = activeProject && activeProject.name === payload.name ? activeProject : null;

    const projectRecord: Project = existing
      ? {
          ...existing,
          ...payload,
          updatedAt: now,
        }
      : {
          id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          ...payload,
          createdAt: now,
          updatedAt: now,
        };

    handleCreateOrUpdateProject(projectRecord, !existing);
    setActiveProject(projectRecord);
  };

  const handleStartCheckout = (plan: PublicPricingPlan, billingCycle: 'monthly' | 'yearly') => {
    if (!isSignedIn) {
      setIsPlansOpen(false);
      setSignInError(null);
      setIsSignInModalOpen(true);
      showToast('Please sign in with Google first to manage plans or claim welcome credits.', 'info');
      return;
    }

    const price = billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
    if (price === 0) {
      showToast(`Your account already includes free Starter access.`, 'info');
      return;
    }

    setCheckoutState({ isOpen: true, plan, billingCycle });
  };

  const openSignInModal = () => {
    setSignInError(null);
    setIsSignInModalOpen(true);
  };

  const handleDismissWelcomeOffer = useCallback(() => {
    dismissWelcomeOffer();
    setWelcomeOfferDismissed(true);
  }, []);

  const handleSignIn = useCallback(async () => {
    setIsSigningIn(true);
    setSignInError(null);
    explicitSignInRef.current = true;
    try {
      await signInWithGoogle();
    } catch (err: any) {
      explicitSignInRef.current = false;
      if (err?.code !== 'auth/popup-closed-by-user') {
        const msg = err.message || 'Google sign-in cancelled or failed.';
        setSignInError(msg);
        if (err?.code === 'auth/popup-blocked') {
          setIsSignInModalOpen(true);
        }
        showToast(msg, 'error');
      }
    } finally {
      setIsSigningIn(false);
    }
  }, [showToast]);

  const handleMarkAllNotificationsRead = () => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      saveNotifications(next);
      return next;
    });
    if (isSignedIn) {
      void markAllUserNotificationsRead().catch(() => undefined);
    }
  };

  const handleWorkspaceRestored = () => {
    setFavoriteIds(getSavedFavorites());
    setHistory(getGenerationHistory());
    setProjects(getSavedProjects());
    setProfile(isSignedIn ? getUserProfile() : GUEST_DEFAULT_PROFILE);
    setPreferences(getUserPreferences());
  };

  const handleSignOut = async () => {
    if (isSignedIn) {
      await signOutFirebase().catch(() => undefined);
      setIsSignedIn(false);
    }
    resetLocalSession();
    setActiveProject(null);
    setProfile(GUEST_DEFAULT_PROFILE);
    setCredits(GUEST_DEFAULT_CREDITS);
    saveCreditLedger(GUEST_DEFAULT_CREDITS);
    saveNotifications(GUEST_DEFAULT_NOTIFICATIONS);
    setProjects(getSavedProjects());
    setNotifications(GUEST_DEFAULT_NOTIFICATIONS);
    setUserPayments([]);
    void loadInitialData(false);
    showToast('Signed out cleanly.', 'info');
  };

  if (platformSettings.maintenanceMode) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] dark:bg-[#090C12] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-[#D97706]/12 text-[#D97706] dark:text-[#F59E0B] flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="font-display text-xl font-bold text-[#11162B] dark:text-[#F3F5FA]">
            {platformSettings.siteName} Maintenance
          </h1>
          <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] leading-relaxed">
            {platformSettings.maintenanceMessage}
          </p>
          {platformSettings.supportEmail && (
            <p className="text-[11px] font-mono text-[#2E5BFF] dark:text-[#7A9AFF]">
              Support: {platformSettings.supportEmail}
            </p>
          )}
          <div className="pt-2">
            <a
              href="/admin"
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#2E5BFF] dark:hover:text-[#7A9AFF] transition-colors"
            >
              <Lock className="w-3 h-3" />
              <span>Administrator Access</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full flex overflow-hidden bg-[#F7F8FA] dark:bg-[#090C12] text-[#11162B] dark:text-[#F3F5FA] font-sans selection:bg-[#2E5BFF]/15 selection:text-[#2E5BFF] transition-colors">
      {/* Left Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapse}
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
        favoritesCount={favoriteIds.length}
        historyCount={history.length}
        projectsCount={projects.length}
        planName={credits.planName}
        onOpenPlans={() => setIsPlansOpen(true)}
        onOpenHelp={(section) => setHelpModalState({ isOpen: true, section })}
        siteName={platformSettings.siteName}
        logoUrl={platformSettings.logoUrl}
      />

      {/* Right Column: Top Header + Scrollable Workspace (NO Footer) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopHeader
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
          voices={voices}
          projects={projects}
          onSelectVoice={handleSelectVoice}
          onOpenProject={handleOpenProjectInStudio}
          credits={credits}
          onOpenPlans={() => setIsPlansOpen(true)}
          profile={profile}
          isDarkTheme={preferences.theme === 'dark'}
          onToggleTheme={handleToggleTheme}
          notifications={notifications}
          onMarkAllRead={handleMarkAllNotificationsRead}
          onOpenShortcuts={() => setIsShortcutsOpen(true)}
          onSignOut={handleSignOut}
          isSignedIn={isSignedIn}
          onSignIn={openSignInModal}
        />

        <main className="flex-1 overflow-y-auto">
          {activeTab === 'create' && (
            <CreateSpeechView
              voices={voices}
              totalVoiceCount={totalVoiceCount}
              selectedVoice={selectedVoice}
              onClearVoice={() => setSelectedVoice(null)}
              onOpenVoiceSelector={handleOpenVoiceSelector}
              config={config}
              initialScript={editorSeed?.script}
              initialScriptKey={editorSeed?.key}
              activeProject={activeProject}
              defaultSpeed={editorSeed?.speed ?? preferences.defaultSpeed}
              defaultWithTranscript={false}
              remainingCredits={credits.remainingCredits}
              onGenerationComplete={handleGenerationComplete}
              onDeleteGeneratedItem={handleRemoveHistoryItem}
              onSaveToProject={handleSaveToProjectFromStudio}
              favoriteIds={favoriteIds}
              onToggleFavorite={handleToggleFavorite}
              isSignedIn={isSignedIn}
              isSigningIn={isSigningIn}
              onOpenSignIn={openSignInModal}
              onDirectGoogleSignIn={handleSignIn}
              welcomeOfferDismissed={welcomeOfferDismissed}
              onDismissWelcomeOffer={handleDismissWelcomeOffer}
              welcomeBonusCredits={platformSettings.signupBonusCredits ?? 5000}
              signupBonusEnabled={platformSettings.signupBonusEnabled !== false}
              creditCostPer1kChars={platformSettings.creditCostPer1kChars ?? 1000}
              transcriptSurchargePercent={platformSettings.transcriptSurchargePercent ?? 25}
            />
          )}

          {activeTab === 'library' && (
            <VoiceLibraryView
              voices={voices}
              inspection={inspection}
              favoriteIds={favoriteIds}
              recentIds={recentIds}
              selectedVoiceId={selectedVoice?.id || null}
              isLoading={isLoadingVoices}
              onRefreshCatalog={() => loadInitialData(true)}
              onToggleFavorite={handleToggleFavorite}
              onSelectVoice={handleSelectVoice}
              onNavigateToCreate={() => setActiveTab('create')}
            />
          )}

          {activeTab === 'favorites' && (
            <FavoritesView
              voices={voices}
              favoriteIds={favoriteIds}
              selectedVoiceId={selectedVoice?.id || null}
              onToggleFavorite={handleToggleFavorite}
              onSelectVoice={handleSelectVoice}
              onNavigateToLibrary={() => setActiveTab('library')}
              onNavigateToCreate={() => setActiveTab('create')}
            />
          )}

          {activeTab === 'history' && (
            <HistoryView
              history={history}
              onRemoveItem={handleRemoveHistoryItem}
              onClearHistory={handleClearHistory}
              onUseTextInCreate={(text, voiceId, speed) => {
                const voice = voices.find((v) => v.id === voiceId);
                if (voice) setSelectedVoice(voice);
                setActiveProject(null);
                setEditorSeed({
                  script: text,
                  speed,
                  withTranscript: false,
                  isProjectSession: false,
                  key: Date.now(),
                });
                setActiveTab('create');
              }}
            />
          )}

          {activeTab === 'projects' && (
            <ProjectsView
              projects={projects}
              voices={voices}
              history={history}
              onCreateOrUpdateProject={handleCreateOrUpdateProject}
              onDeleteProject={handleDeleteProject}
              onOpenProjectInStudio={handleOpenProjectInStudio}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              config={config}
              inspection={inspection}
              favoritesCount={favoriteIds.length}
              historyCount={history.length}
              projectsCount={projects.length}
              profile={profile}
              preferences={preferences}
              credits={credits}
              onUpdateProfile={handleUpdateProfile}
              onUpdatePreferences={handleUpdatePreferences}
              onOpenPlans={() => setIsPlansOpen(true)}
              onRefreshCatalog={() => loadInitialData(true)}
              onFavoritesCleared={() => setFavoriteIds([])}
              onHistoryCleared={handleClearHistory}
              onWorkspaceRestored={handleWorkspaceRestored}
              onSignOut={handleSignOut}
              isSignedIn={isSignedIn}
              onOpenSignIn={openSignInModal}
            />
          )}
        </main>
        <GlobalMiniPlayer />
      </div>

      {/* Modals */}
      <GoogleSignInModal
        isOpen={isSignInModalOpen}
        onClose={() => {
          if (!isSigningIn) setIsSignInModalOpen(false);
        }}
        onContinueWithGoogle={handleSignIn}
        isLoading={isSigningIn}
        errorMessage={signInError}
        welcomeBonusCredits={platformSettings.signupBonusCredits ?? 5000}
        signupBonusEnabled={platformSettings.signupBonusEnabled !== false}
        siteName={platformSettings.siteName}
      />

      <VoiceSelectorModal
        isOpen={isVoiceSelectorOpen}
        onClose={handleCloseVoiceSelector}
        voices={voices}
        totalVoiceCount={totalVoiceCount}
        selectedVoiceId={selectedVoice?.id || null}
        favoriteIds={favoriteIds}
        recentIds={recentIds}
        onSelectVoice={handleSelectVoice}
        onToggleFavorite={handleToggleFavorite}
      />

      <PlansModal
        isOpen={isPlansOpen}
        onClose={() => setIsPlansOpen(false)}
        credits={credits}
        plans={platformPlans}
        onStartCheckout={handleStartCheckout}
      />

      <CheckoutModal
        isOpen={checkoutState.isOpen}
        onClose={() => setCheckoutState((s) => ({ ...s, isOpen: false }))}
        selectedPlan={checkoutState.plan}
        billingCycle={checkoutState.billingCycle}
        settings={platformSettings}
        isSignedIn={isSignedIn}
        onSignIn={handleSignIn}
        paymentRequests={userPayments}
        onPaymentUpdated={hydrateSignedInUser}
      />

      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      <HelpDocsModal
        isOpen={helpModalState.isOpen}
        onClose={() => setHelpModalState((s) => ({ ...s, isOpen: false }))}
        initialTab={helpModalState.section}
      />
    </div>
  );
}

export default function App() {
  const [pathname, setPathname] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );

  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');

  return (
    <ToastProvider>
      <AudioPlayerProvider>
        {isAdminRoute ? (
          <AdminApp
            onNavigateToStudio={() => {
              window.history.pushState({}, '', '/');
              setPathname('/');
            }}
          />
        ) : (
          <SpeaklyStudioShell />
        )}
      </AudioPlayerProvider>
    </ToastProvider>
  );
}
