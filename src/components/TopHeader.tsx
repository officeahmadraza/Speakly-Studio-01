import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Search,
  Bell,
  Database,
  ChevronDown,
  Menu,
  User,
  Settings,
  CreditCard,
  BarChart2,
  Keyboard,
  LogOut,
  Sun,
  Moon,
  Sparkles,
  Check,
  Mic,
  FolderKanban,
  ArrowRight,
  X,
} from 'lucide-react';
import {
  NavTab,
  Voice,
  Project,
  CreditLedgerState,
  UserProfile,
  AppNotification,
} from '../types/index.js';
import { getVoiceInitials, getVoiceAvatarGradient } from './VoiceCard.js';
import { GoogleLogoSvg } from './GoogleSignInModal.js';
import { fetchVoicesPage } from '../services/api.js';

interface TopHeaderProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenMobileNav: () => void;
  voices: Voice[];
  projects: Project[];
  onSelectVoice: (voice: Voice) => void;
  onOpenProject: (project: Project) => void;
  credits: CreditLedgerState;
  onOpenPlans: () => void;
  profile: UserProfile;
  isDarkTheme: boolean;
  onToggleTheme: () => void;
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onOpenShortcuts: () => void;
  onSignOut: () => void;
  isSignedIn?: boolean;
  onSignIn?: () => void;
}

const TAB_LABELS: Record<NavTab, string> = {
  create: 'Create Speech',
  library: 'Voice Library',
  favorites: 'Favorites',
  history: 'History',
  projects: 'My Projects',
  settings: 'Settings',
};

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  onSelectTab,
  onOpenMobileNav,
  voices,
  projects,
  onSelectVoice,
  onOpenProject,
  credits,
  onOpenPlans,
  profile,
  isDarkTheme,
  onToggleTheme,
  notifications,
  onMarkAllRead,
  onOpenShortcuts,
  onSignOut,
  isSignedIn = false,
  onSignIn,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [remoteMatchedVoices, setRemoteMatchedVoices] = useState<Voice[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [openMenu, setOpenMenu] = useState<'credits' | 'notifications' | 'profile' | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Global keyboard shortcuts: Cmd/Ctrl + K for search, Escape to close popovers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchFocused(true);
      } else if (e.key === 'Escape') {
        setOpenMenu(null);
        setIsSearchFocused(false);
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced server-side voice lookup for full 3,022+ catalog reach in Cmd+K search
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setRemoteMatchedVoices([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchVoicesPage({ q, page: 1, limit: 5, signal: controller.signal })
        .then((res) => {
          if (!controller.signal.aborted) {
            setRemoteMatchedVoices(res.items);
          }
        })
        .catch(() => undefined);
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  // Search matching voices, languages, and projects
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { voices: [], projects: [], pages: [] };

    const localMatched = voices
      .filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.language?.toLowerCase().includes(q) ||
          v.accent?.toLowerCase().includes(q) ||
          v.category?.toLowerCase().includes(q)
      )
      .slice(0, 5);

    const matchedVoices =
      q.length >= 2 && remoteMatchedVoices.length > 0
        ? remoteMatchedVoices.slice(0, 5)
        : localMatched;

    const matchedProjects = projects
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
      )
      .slice(0, 3);

    const matchedPages = (Object.keys(TAB_LABELS) as NavTab[])
      .filter((t) => TAB_LABELS[t].toLowerCase().includes(q))
      .map((t) => ({ id: t, label: TAB_LABELS[t] }));

    return { voices: matchedVoices, projects: matchedProjects, pages: matchedPages };
  }, [searchQuery, voices, remoteMatchedVoices, projects]);

  const usagePercent = Math.min(
    100,
    Math.round((credits.remainingCredits / Math.max(1, credits.monthlyAllowance)) * 100)
  );

  const initials = getVoiceInitials(profile.displayName || 'User');

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-30 h-[64px] sm:h-[68px] w-full bg-white/95 dark:bg-[#101521]/95 backdrop-blur-md border-b border-[#E4E7EF] dark:border-[#1E2638] px-3 sm:px-5 lg:px-6 flex items-center justify-between gap-2 sm:gap-4 shrink-0"
    >
      {/* Left: Mobile & Tablet Drawer Button + Breadcrumb + Global Search */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="lg:hidden p-2 rounded-xl text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-white hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] min-w-[40px] min-h-[40px] flex items-center justify-center shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Contextual Breadcrumb */}
        <div className="hidden xl:flex items-center gap-2 text-xs text-[#5A6580] dark:text-[#A2ADC7] shrink-0 mr-2 whitespace-nowrap">
          <span className="font-medium">Studio</span>
          <span aria-hidden="true" className="text-[#CFD6E6] dark:text-[#2C364F]">/</span>
          <span className="font-display text-[13px] font-bold text-[#11162B] dark:text-[#F3F5FA]">
            {TAB_LABELS[activeTab]}
          </span>
        </div>

        {/* Global Search Field */}
        <div className="relative flex-1 min-w-0 max-w-md">
          <Search className="w-4 h-4 text-[#78839E] dark:text-[#7C87A3] absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchFocused(true);
            }}
            placeholder="Search voices, languages, projects..."
            aria-label="Global search"
            className="w-full h-9 pl-9 sm:pl-10 pr-8 sm:pr-14 rounded-xl bg-[#F7F8FA] dark:bg-[#090C12] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:bg-white dark:focus:bg-[#101521] focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] focus:ring-2 focus:ring-[#2E5BFF]/15 transition-all"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#78839E] hover:text-[#11162B] dark:hover:text-white cursor-pointer"
              aria-label="Clear global search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] text-[10px] font-mono text-[#5A6580] dark:text-[#A2ADC7] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              ⌘K
            </kbd>
          )}

          {/* Instant Search Dropdown */}
          {isSearchFocused && searchQuery.trim().length > 0 && (
            <div className="absolute left-0 right-0 top-11 bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl shadow-xl shadow-[#090C12]/12 overflow-hidden z-50 max-h-[380px] overflow-y-auto animate-studio-enter">
              {searchResults.voices.length === 0 &&
              searchResults.projects.length === 0 &&
              searchResults.pages.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#5A6580] dark:text-[#A2ADC7]">
                  No voices, projects, or pages match "{searchQuery}"
                </div>
              ) : (
                <div className="p-2 space-y-2">
                  {searchResults.pages.length > 0 && (
                    <div>
                      <div className="px-2.5 py-1 text-[11px] font-semibold text-[#78839E] dark:text-[#7C87A3]">
                        Workspace Pages
                      </div>
                      {searchResults.pages.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            onSelectTab(p.id);
                            setSearchQuery('');
                            setIsSearchFocused(false);
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-[#11162B] dark:text-[#F3F5FA] hover:bg-[#EEF2FF] dark:hover:bg-[#171E2E] transition-colors cursor-pointer"
                        >
                          <span>Go to {p.label}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-[#2E5BFF] dark:text-[#7A9AFF]" />
                        </button>
                      ))}
                    </div>
                  )}

                  {searchResults.voices.length > 0 && (
                    <div>
                      <div className="px-2.5 py-1 text-[11px] font-semibold text-[#78839E] dark:text-[#7C87A3]">
                        Voices
                      </div>
                      {searchResults.voices.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            onSelectVoice(v);
                            onSelectTab('create');
                            setSearchQuery('');
                            setIsSearchFocused(false);
                          }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left hover:bg-[#EEF2FF] dark:hover:bg-[#171E2E] transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Mic className="w-3.5 h-3.5 text-[#2E5BFF] dark:text-[#7A9AFF] shrink-0" />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] truncate">
                                {v.name}
                              </div>
                              <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] truncate">
                                {[v.language, v.accent, v.category].filter(Boolean).join(' · ') || 'Voice Actor'}
                              </div>
                            </div>
                          </div>
                          <span className="text-[11px] font-semibold text-[#2E5BFF] dark:text-[#7A9AFF] shrink-0">Select</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchResults.projects.length > 0 && (
                    <div>
                      <div className="px-2.5 py-1 text-[11px] font-semibold text-[#78839E] dark:text-[#7C87A3]">
                        Projects
                      </div>
                      {searchResults.projects.map((proj) => (
                        <button
                          key={proj.id}
                          type="button"
                          onClick={() => {
                            onOpenProject(proj);
                            setSearchQuery('');
                            setIsSearchFocused(false);
                          }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left hover:bg-[#EEF2FF] dark:hover:bg-[#171E2E] transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FolderKanban className="w-3.5 h-3.5 text-[#2E5BFF] dark:text-[#7A9AFF] shrink-0" />
                            <span className="text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] truncate">
                              {proj.name}
                            </span>
                          </div>
                          <span className="text-[11px] text-[#2E5BFF] dark:text-[#7A9AFF] font-semibold shrink-0">Open</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: Credits Trigger, Notifications, Theme Toggle, Profile */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {/* Credits Button + Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu((m) => (m === 'credits' ? null : 'credits'))}
            aria-expanded={openMenu === 'credits'}
            className="h-9 px-2.5 sm:px-3 rounded-xl bg-[#EEF2FF] dark:bg-[#171E2E] hover:bg-[#E2E8FF] dark:hover:bg-[#1F293D] border border-[#2E5BFF]/15 dark:border-[#4D74FF]/25 text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] flex items-center gap-1.5 sm:gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
          >
            <Database className="w-3.5 h-3.5 text-[#2E5BFF] dark:text-[#7A9AFF] shrink-0" />
            <span className="font-mono tabular-nums">
              {credits.remainingCredits.toLocaleString()}
              <span className="hidden sm:inline"> Credits</span>
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-[#5A6580] dark:text-[#A2ADC7] shrink-0" />
          </button>

          {openMenu === 'credits' && (
            <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl shadow-xl shadow-[#090C12]/12 p-4 z-50 space-y-3.5 animate-studio-enter">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-display text-xs font-bold text-[#11162B] dark:text-[#F3F5FA] truncate">
                    {isSignedIn ? `${credits.planName} Credit Balance` : 'Sign In Required for Credits'}
                  </div>
                  <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">
                    {isSignedIn
                      ? `Plan allocation: ${credits.monthlyAllowance.toLocaleString()}`
                      : 'New Google accounts receive 5,000 free credits'}
                  </div>
                </div>
                <span className="text-sm font-bold font-mono tabular-nums text-[#2E5BFF] dark:text-[#7A9AFF] shrink-0">
                  {credits.remainingCredits.toLocaleString()}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="w-full h-1.5 rounded-full bg-[#EEF2FF] dark:bg-[#1E2638] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#2E5BFF] dark:bg-[#4D74FF] transition-all"
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-[#5A6580] dark:text-[#A2ADC7] font-mono tabular-nums">
                  <span>{isSignedIn ? `${usagePercent}% remaining` : '0% active'}</span>
                  <span>
                    {Math.max(0, credits.monthlyAllowance - credits.remainingCredits).toLocaleString()} used
                  </span>
                </div>
              </div>

              {credits.events.length > 0 && (
                <div className="pt-2.5 border-t border-[#E4E7EF] dark:border-[#1E2638] space-y-1.5 max-h-32 overflow-y-auto">
                  <div className="text-[11px] font-semibold text-[#78839E] dark:text-[#7C87A3]">
                    Recent Activity
                  </div>
                  {credits.events.slice(0, 3).map((ev) => (
                    <div key={ev.id} className="flex items-center justify-between text-[11px]">
                      <span className="text-[#5A6580] dark:text-[#A2ADC7] truncate pr-2">{ev.label}</span>
                      <span
                        className={`font-mono tabular-nums font-semibold shrink-0 ${
                          ev.amount >= 0 ? 'text-[#16A34A] dark:text-[#22C55E]' : 'text-[#11162B] dark:text-[#F3F5FA]'
                        }`}
                      >
                        {ev.amount >= 0 ? `+${ev.amount}` : ev.amount}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {!isSignedIn && onSignIn && (
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    onSignIn();
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-white dark:bg-[#090C12] border border-[#CFD6E6] dark:border-[#2C364F] hover:border-[#2E5BFF] text-[#11162B] dark:text-[#F3F5FA] text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <GoogleLogoSvg className="w-3.5 h-3.5" />
                  <span>Continue with Google (+5,000 Credits)</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  onOpenPlans();
                }}
                className="w-full py-2 px-3 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Upgrade or Top Up Credits</span>
              </button>
            </div>
          )}
        </div>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu((m) => (m === 'notifications' ? null : 'notifications'))}
            aria-label="Notifications"
            aria-expanded={openMenu === 'notifications'}
            className="relative w-9 h-9 rounded-xl border border-[#E4E7EF] dark:border-[#1E2638] bg-white dark:bg-[#101521] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span
                className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#2E5BFF] dark:bg-[#4D74FF]"
                aria-label={`${unreadCount} unread notifications`}
              />
            )}
          </button>

          {openMenu === 'notifications' && (
            <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl shadow-xl shadow-[#090C12]/12 overflow-hidden z-50 animate-studio-enter">
              <div className="px-4 py-3 border-b border-[#E4E7EF] dark:border-[#1E2638] flex items-center justify-between">
                <span className="font-display text-xs font-bold text-[#11162B] dark:text-[#F3F5FA]">
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAllRead}
                    className="text-[11px] font-semibold text-[#2E5BFF] dark:text-[#7A9AFF] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                    <span>Mark all read</span>
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-[#E4E7EF] dark:divide-[#1E2638]">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#5A6580] dark:text-[#A2ADC7]">No notifications yet</div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-3.5 text-xs ${
                        !n.read ? 'bg-[#EEF2FF]/60 dark:bg-[#4D74FF]/10' : ''
                      }`}
                    >
                      <div className="font-semibold text-[#11162B] dark:text-[#F3F5FA]">{n.title}</div>
                      <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] mt-0.5 leading-relaxed">
                        {n.message}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Light / Dark Quick Toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDarkTheme ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          title={isDarkTheme ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="hidden sm:flex w-9 h-9 rounded-xl border border-[#E4E7EF] dark:border-[#1E2638] bg-white dark:bg-[#101521] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-white items-center justify-center transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
        >
          {isDarkTheme ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Prominent Continue with Google CTA when signed out */}
        {!isSignedIn && onSignIn && (
          <button
            type="button"
            onClick={onSignIn}
            className="flex items-center gap-2 h-9 px-3 sm:px-3.5 rounded-xl bg-white dark:bg-[#101521] border border-[#CFD6E6] dark:border-[#2C364F] hover:border-[#2E5BFF] text-xs font-bold text-[#11162B] dark:text-[#F3F5FA] transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
          >
            <GoogleLogoSvg className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Continue with Google</span>
            <span className="sm:hidden">Sign In</span>
          </button>
        )}

        {/* User Profile Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu((m) => (m === 'profile' ? null : 'profile'))}
            aria-expanded={openMenu === 'profile'}
            className="h-9 flex items-center gap-2 p-1 pr-2 rounded-xl hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
          >
            {isSignedIn && profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.displayName}
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-full object-cover border border-[#E4E7EF] dark:border-[#1E2638]"
              />
            ) : (
              <div
                className={`w-7 h-7 rounded-full bg-gradient-to-br ${getVoiceAvatarGradient(
                  profile.displayName || 'Guest'
                )} flex items-center justify-center text-white text-[11px] font-bold`}
              >
                {initials}
              </div>
            )}
            <span className="hidden lg:inline text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] max-w-[120px] truncate">
              {profile.displayName}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-[#5A6580] dark:text-[#A2ADC7]" />
          </button>

          {openMenu === 'profile' && (
            <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl shadow-xl shadow-[#090C12]/12 p-1.5 z-50 animate-studio-enter">
              <div className="px-3 py-2.5 border-b border-[#E4E7EF] dark:border-[#1E2638] mb-1">
                <div className="font-display text-xs font-bold text-[#11162B] dark:text-[#F3F5FA] truncate">
                  {profile.displayName}
                </div>
                <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] truncate">
                  {isSignedIn ? profile.email : 'Not signed in · 0 active credits'}
                </div>
              </div>

              {[
                {
                  label: 'My Profile',
                  icon: User,
                  action: () => onSelectTab('settings'),
                },
                {
                  label: 'Account Settings',
                  icon: Settings,
                  action: () => onSelectTab('settings'),
                },
                {
                  label: 'Billing & Plans',
                  icon: CreditCard,
                  action: onOpenPlans,
                },
                {
                  label: 'Usage & Credits',
                  icon: BarChart2,
                  action: () => setOpenMenu('credits'),
                },
                {
                  label: 'Keyboard Shortcuts',
                  icon: Keyboard,
                  action: onOpenShortcuts,
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      if (item.label !== 'Usage & Credits') setOpenMenu(null);
                      item.action();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-[#11162B] dark:text-[#F3F5FA] hover:bg-[#EEF2FF] dark:hover:bg-[#171E2E] transition-colors cursor-pointer"
                  >
                    <Icon className="w-3.5 h-3.5 text-[#5A6580] dark:text-[#A2ADC7]" />
                    <span>{item.label}</span>
                  </button>
                );
              })}

              <div className="my-1 border-t border-[#E4E7EF] dark:border-[#1E2638]" />

              {isSignedIn ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    onSignOut();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-[#DC2626] dark:text-[#F87171] hover:bg-[#DC2626]/10 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              ) : (
                onSignIn && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      onSignIn();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-[#2E5BFF] dark:text-[#7A9AFF] hover:bg-[#EEF2FF] dark:hover:bg-[#171E2E] transition-colors cursor-pointer"
                  >
                    <GoogleLogoSvg className="w-3.5 h-3.5 shrink-0" />
                    <span>Continue with Google</span>
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
