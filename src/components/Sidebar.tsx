import React, { useEffect } from 'react';
import {
  Mic,
  Library,
  Heart,
  History,
  FolderKanban,
  Settings,
  HelpCircle,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  Sparkles,
  Headphones,
  X,
  ArrowRight,
} from 'lucide-react';
import { NavTab } from '../types/index.js';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  favoritesCount: number;
  historyCount: number;
  projectsCount: number;
  planName: string;
  onOpenPlans: () => void;
  onOpenHelp: (initialSection: 'support' | 'docs') => void;
  siteName?: string;
  logoUrl?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  favoritesCount,
  historyCount,
  projectsCount,
  planName,
  onOpenPlans,
  onOpenHelp,
  siteName = 'Speakly Studio',
  logoUrl,
}) => {
  const navItems: {
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
  }[] = [
    { id: 'create', label: 'Create Speech', icon: Mic },
    { id: 'library', label: 'Voice Library', icon: Library },
    { id: 'favorites', label: 'Favorites', icon: Heart, count: favoritesCount },
    { id: 'history', label: 'History', icon: History, count: historyCount },
    { id: 'projects', label: 'My Projects', icon: FolderKanban, count: projectsCount },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  useEffect(() => {
    if (!isMobileOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isMobileOpen, onCloseMobile]);

  const handleNavClick = (tab: NavTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  const renderSidebarBody = (mobileMode: boolean) => {
    const compact = !mobileMode && isCollapsed;

    return (
      <div className="flex flex-col h-full bg-white dark:bg-[#101521] border-r border-[#E4E7EF] dark:border-[#1E2638] select-none">
        {/* Brand Header */}
        <div
          className={`h-[64px] sm:h-[68px] flex items-center justify-between px-4 shrink-0 border-b border-[#E4E7EF] dark:border-[#1E2638] ${
            compact ? 'justify-center px-2' : 'px-5'
          }`}
        >
          <button
            type="button"
            onClick={() => handleNavClick('create')}
            className="flex items-center gap-2.5 group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF] rounded-lg whitespace-nowrap shrink-0"
            title={siteName}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={siteName}
                className="w-9 h-9 rounded-xl object-cover border border-[#E4E7EF] dark:border-[#1E2638] shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-[#EEF2FF] dark:bg-[#4D74FF]/14 border border-[#2E5BFF]/15 dark:border-[#4D74FF]/25 flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-[1.03]">
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M3 10v4" className="stroke-[#2E5BFF] dark:stroke-[#7A9AFF]" />
                  <path d="M7.5 7v10" className="stroke-[#2E5BFF] dark:stroke-[#7A9AFF]" />
                  <path d="M12 4v16" className="stroke-[#2E5BFF] dark:stroke-[#7A9AFF]" />
                  <path d="M16.5 6.5v11" className="stroke-[#2E5BFF] dark:stroke-[#7A9AFF]" />
                  <path d="M21 10v4" className="stroke-[#2E5BFF] dark:stroke-[#7A9AFF]" />
                </svg>
              </div>
            )}
            {!compact && (
              <div className="flex items-center gap-1 whitespace-nowrap text-left leading-none font-display">
                <span className="text-[16px] font-bold tracking-tight text-[#11162B] dark:text-[#F3F5FA]">
                  {siteName.split(' ')[0] || 'Speakly'}
                </span>
                <span className="text-[16px] font-bold tracking-tight text-[#2E5BFF] dark:text-[#7A9AFF]">
                  {siteName.split(' ').slice(1).join(' ') || 'Studio'}
                </span>
              </div>
            )}
          </button>

          {mobileMode && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="p-2 rounded-lg text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-white hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
              aria-label="Close navigation menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Primary Navigation Links */}
        <nav className="flex-1 px-3 py-3.5 space-y-1 overflow-y-auto" aria-label="Primary Sidebar Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                title={compact ? item.label : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={`group relative w-full flex items-center ${
                  compact ? 'justify-center px-0 py-3' : 'justify-between px-3.5 py-2.5'
                } rounded-xl text-[13.5px] transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF] min-h-[42px] whitespace-nowrap ${
                  isActive
                    ? 'bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] font-semibold'
                    : 'text-[#5A6580] dark:text-[#A2ADC7] font-medium hover:text-[#11162B] dark:hover:text-[#F3F5FA] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                      isActive
                        ? 'text-[#2E5BFF] dark:text-[#7A9AFF]'
                        : 'text-[#78839E] dark:text-[#7C87A3] group-hover:text-[#11162B] dark:group-hover:text-[#F3F5FA]'
                    }`}
                  />
                  {!compact && <span className="truncate whitespace-nowrap">{item.label}</span>}
                </div>

                {!compact && typeof item.count === 'number' && item.count > 0 && (
                  <span
                    className={`text-[11px] font-mono tabular-nums ${
                      isActive ? 'text-[#2E5BFF] dark:text-[#7A9AFF]' : 'text-[#78839E] dark:text-[#7C87A3]'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Upgrade Section & Utility Controls */}
        <div className="shrink-0 border-t border-[#E4E7EF] dark:border-[#1E2638]">
          {!compact ? (
            <div className="px-4 py-3.5 bg-[#F7F8FA] dark:bg-[#0D121D] border-b border-[#E4E7EF] dark:border-[#1E2638] space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] flex items-center justify-center shrink-0">
                  <Headphones className="w-3.5 h-3.5" />
                </div>
                <h3 className="font-display text-[13px] font-bold text-[#11162B] dark:text-[#F3F5FA] leading-tight truncate">
                  {planName === 'Guest'
                    ? '5,000 Free Credits'
                    : planName === 'Starter'
                    ? 'Upgrade to Pro'
                    : `${planName} Plan Active`}
                </h3>
              </div>
              <p className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] leading-relaxed">
                {planName === 'Guest'
                  ? 'Sign in with Google for welcome credits or explore studio plans.'
                  : planName === 'Starter'
                  ? 'Unlock higher monthly allowances and priority voice synthesis.'
                  : 'Manage your credit allowance or explore studio tiers.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  onOpenPlans();
                  onCloseMobile();
                }}
                className="w-full py-2 px-3 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold transition-colors active:scale-[0.99] flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/50"
              >
                <span>Explore Plans</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="p-2.5 border-b border-[#E4E7EF] dark:border-[#1E2638]">
              <button
                type="button"
                onClick={onOpenPlans}
                title="Upgrade to Pro — Explore Plans"
                className="w-full py-2.5 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/50"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Help & Support / Documentation */}
          <div className="p-2.5 space-y-0.5">
            <button
              type="button"
              onClick={() => {
                onOpenHelp('support');
                onCloseMobile();
              }}
              title={compact ? 'Help & Support' : undefined}
              className={`w-full flex items-center ${
                compact ? 'justify-center px-0' : 'gap-2.5 px-3'
              } py-2 rounded-lg text-xs font-medium text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]`}
            >
              <HelpCircle className="w-4 h-4 shrink-0" />
              {!compact && <span>Help & Support</span>}
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenHelp('docs');
                onCloseMobile();
              }}
              title={compact ? 'Documentation' : undefined}
              className={`w-full flex items-center ${
                compact ? 'justify-center px-0' : 'gap-2.5 px-3'
              } py-2 rounded-lg text-xs font-medium text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]`}
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              {!compact && <span>Documentation</span>}
            </button>

            {/* Desktop Collapse Sidebar Control */}
            {!mobileMode && (
              <button
                type="button"
                onClick={onToggleCollapse}
                title={compact ? 'Expand Sidebar' : 'Collapse Sidebar'}
                aria-label={compact ? 'Expand Sidebar' : 'Collapse Sidebar'}
                className={`w-full flex items-center ${
                  compact ? 'justify-center px-0' : 'justify-between px-3'
                } py-2 rounded-lg text-xs font-medium text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]`}
              >
                {!compact && <span>Collapse Sidebar</span>}
                {compact ? (
                  <ChevronsRight className="w-4 h-4 shrink-0" />
                ) : (
                  <ChevronsLeft className="w-4 h-4 shrink-0" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Fixed Collapsible Sidebar (lg+) */}
      <aside
        className={`hidden lg:block shrink-0 h-full transition-[width] duration-200 ease-out ${
          isCollapsed ? 'w-[76px]' : 'w-[244px] xl:w-[252px]'
        }`}
      >
        {renderSidebarBody(false)}
      </aside>

      {/* Mobile & Tablet Slide-Over Drawer (< lg) */}
      {isMobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className="lg:hidden fixed inset-0 z-50 flex bg-[#11162B]/55 backdrop-blur-xs animate-studio-enter"
          onClick={onCloseMobile}
        >
          <div
            className="w-[272px] max-w-[85vw] h-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {renderSidebarBody(true)}
          </div>
        </div>
      )}
    </>
  );
};
