import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Coins,
  CreditCard,
  Layers,
  Cpu,
  FolderKanban,
  History,
  Mic,
  UserCog,
  FileSearch,
  Settings,
  LogOut,
  Search,
  Bell,
  Menu,
  X,
  ChevronDown,
  KeyRound,
  ExternalLink,
  Shield,
} from 'lucide-react';
import { AdminAccountPublic, AdminSectionId } from '../types.js';

interface AdminLayoutProps {
  admin: AdminAccountPublic;
  activeSection: AdminSectionId;
  onSelectSection: (section: AdminSectionId) => void;
  pendingPaymentsCount: number;
  quickSearch: string;
  onQuickSearchChange: (q: string) => void;
  onOpenChangePassword: () => void;
  onLogout: () => void;
  onNavigateToStudio: () => void;
  children: React.ReactNode;
}

export function adminHasPerm(admin: AdminAccountPublic, perm: string): boolean {
  if (admin.role === 'Super Admin' || admin.permissions.includes('*')) return true;
  return admin.permissions.includes(perm);
}

export const NAV_ITEMS: {
  id: AdminSectionId;
  label: string;
  permission: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'Dashboard', permission: 'dashboard:view', icon: LayoutDashboard },
  { id: 'users', label: 'User Management', permission: 'users:view', icon: Users },
  { id: 'credits', label: 'Credit Management', permission: 'credits:view', icon: Coins },
  { id: 'payments', label: 'Payments', permission: 'payments:view', icon: CreditCard },
  { id: 'plans', label: 'Pricing Plans', permission: 'plans:view', icon: Layers },
  { id: 'api', label: 'API Management', permission: 'api:view', icon: Cpu },
  { id: 'projects', label: 'Projects', permission: 'projects:view', icon: FolderKanban },
  { id: 'history', label: 'Speech History', permission: 'history:view', icon: History },
  { id: 'voices', label: 'Voice Library', permission: 'voices:view', icon: Mic },
  { id: 'accounts', label: 'Admin Accounts', permission: 'admins:view', icon: UserCog },
  { id: 'audit', label: 'Activity Logs', permission: 'audit:view', icon: FileSearch },
  { id: 'settings', label: 'Platform Settings', permission: 'settings:view', icon: Settings },
];

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  admin,
  activeSection,
  onSelectSection,
  pendingPaymentsCount,
  quickSearch,
  onQuickSearchChange,
  onOpenChangePassword,
  onLogout,
  onNavigateToStudio,
  children,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => adminHasPerm(admin, item.permission));
  const activeMeta = NAV_ITEMS.find((i) => i.id === activeSection) || NAV_ITEMS[0];

  const renderSidebar = (isMobile: boolean) => (
    <div className="flex flex-col h-full bg-white dark:bg-[#101521] border-r border-[#E4E7EF] dark:border-[#1E2638] select-none">
      <div className="h-[64px] flex items-center justify-between px-5 border-b border-[#E4E7EF] dark:border-[#1E2638] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#2E5BFF] dark:bg-[#4D74FF] text-white flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4" />
          </div>
          <div className="leading-tight">
            <span className="font-display block text-sm font-bold text-[#11162B] dark:text-[#F3F5FA] whitespace-nowrap">
              Speakly Admin
            </span>
            <span className="block text-[11px] font-medium text-[#2E5BFF] dark:text-[#7A9AFF]">
              {admin.role}
            </span>
          </div>
        </div>
        {isMobile && (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="p-2 rounded-lg text-[#5A6580] hover:text-[#11162B] dark:hover:text-[#F3F5FA] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
            aria-label="Close admin sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto" aria-label="Admin Navigation">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          const showBadge = item.id === 'payments' && pendingPaymentsCount > 0;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectSection(item.id);
                setMobileOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 ${
                isActive
                  ? 'bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] font-semibold'
                  : 'font-medium text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E]'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-[17px] h-[17px] shrink-0 ${
                    isActive ? 'text-[#2E5BFF] dark:text-[#7A9AFF]' : ''
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {showBadge && (
                <span className="px-1.5 py-0.5 rounded-md bg-[#DC2626] text-white text-[10px] font-mono font-bold tabular-nums shrink-0">
                  {pendingPaymentsCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[#E4E7EF] dark:border-[#1E2638] space-y-1 shrink-0">
        <button
          type="button"
          onClick={onNavigateToStudio}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#2E5BFF] dark:hover:text-[#7A9AFF] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
        >
          <ExternalLink className="w-4 h-4 shrink-0" />
          <span>Open User Studio</span>
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-[#DC2626] dark:text-[#F87171] hover:bg-[#DC2626]/10 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]/40"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex overflow-hidden bg-[#F7F8FA] dark:bg-[#090C12] text-[#11162B] dark:text-[#F3F5FA]">
      {/* Fixed Left Admin Sidebar */}
      <aside className="hidden md:block w-[252px] shrink-0 h-full">
        {renderSidebar(false)}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex bg-[#090C12]/60 backdrop-blur-xs"
          onClick={() => setMobileOpen(false)}
        >
          <div className="w-[272px] h-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {renderSidebar(true)}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-[64px] bg-white/95 dark:bg-[#101521]/95 backdrop-blur-md border-b border-[#E4E7EF] dark:border-[#1E2638] px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 rounded-lg text-[#5A6580] hover:text-[#11162B] dark:hover:text-[#F3F5FA] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
              aria-label="Open admin menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-base sm:text-lg font-bold text-[#11162B] dark:text-[#F3F5FA] truncate">
                {activeMeta.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Quick Search */}
            <div className="relative hidden sm:block w-56 lg:w-72">
              <Search className="w-3.5 h-3.5 text-[#78839E] dark:text-[#7C87A3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={quickSearch}
                onChange={(e) => onQuickSearchChange(e.target.value)}
                placeholder="Quick filter active view..."
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:bg-white dark:focus:bg-[#101521] focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] focus:ring-2 focus:ring-[#2E5BFF]/15"
              />
            </div>

            {/* Pending Payment Notification Shortcut */}
            {adminHasPerm(admin, 'payments:view') && (
              <button
                type="button"
                onClick={() => onSelectSection('payments')}
                title="Pending Payment Requests"
                className="relative w-9 h-9 rounded-lg border border-[#E4E7EF] dark:border-[#1E2638] bg-white dark:bg-[#101521] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] flex items-center justify-center text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#2E5BFF] dark:hover:text-[#7A9AFF] transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
              >
                <Bell className="w-4 h-4" />
                {pendingPaymentsCount > 0 && (
                  <span className="absolute -top-1 -right-1 px-1.5 min-w-[18px] h-[18px] rounded-full bg-[#DC2626] text-white text-[10px] font-mono tabular-nums font-bold flex items-center justify-center">
                    {pendingPaymentsCount}
                  </span>
                )}
              </button>
            )}

            {/* Admin Profile Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((v) => !v)}
                className="h-9 flex items-center gap-2 px-2.5 rounded-lg border border-[#E4E7EF] dark:border-[#1E2638] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
              >
                <div className="w-6 h-6 rounded-full bg-[#2E5BFF] dark:bg-[#4D74FF] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  {admin.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="hidden lg:block text-left leading-tight">
                  <div className="text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] max-w-[130px] truncate">
                    {admin.name}
                  </div>
                  <div className="text-[10px] text-[#5A6580] dark:text-[#A2ADC7] truncate max-w-[130px]">
                    {admin.email}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-[#5A6580] dark:text-[#A2ADC7]" />
              </button>

              {profileMenuOpen && (
                <div
                  className="absolute right-0 mt-2 w-60 bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl shadow-xl shadow-[#090C12]/10 p-1.5 z-50 animate-studio-enter"
                  onMouseLeave={() => setProfileMenuOpen(false)}
                >
                  <div className="px-3 py-2 border-b border-[#E4E7EF] dark:border-[#1E2638] mb-1">
                    <div className="font-display text-xs font-semibold truncate">{admin.name}</div>
                    <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] truncate">{admin.email}</div>
                    <div className="text-[10px] font-medium text-[#2E5BFF] dark:text-[#7A9AFF] mt-0.5">{admin.role}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      onOpenChangePassword();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium hover:bg-[#EEF2FF] dark:hover:bg-[#171E2E] cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-[#2E5BFF] dark:text-[#7A9AFF]" />
                    <span>Change Password</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[#DC2626] dark:text-[#F87171] hover:bg-[#DC2626]/10 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-[1440px] mx-auto space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
};
