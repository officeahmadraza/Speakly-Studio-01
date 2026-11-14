import React, { useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import { auth, signInWithGoogle } from '../firebase.js';
import { adminApi, registerAdminUnauthorizedHandler } from './api.js';
import { AdminAccountPublic, AdminSectionId } from './types.js';
import { AdminLoginView } from './components/AdminLoginView.js';
import { AdminLayout, adminHasPerm, NAV_ITEMS, FirestoreSyncBannerInfo } from './components/AdminLayout.js';
import { AdminDashboardView } from './views/AdminDashboardView.js';
import { AdminUsersView } from './views/AdminUsersView.js';
import { AdminCreditsView } from './views/AdminCreditsView.js';
import { AdminPaymentsView } from './views/AdminPaymentsView.js';
import { AdminPlansView } from './views/AdminPlansView.js';
import { AdminApiView } from './views/AdminApiView.js';
import { AdminProjectsView } from './views/AdminProjectsView.js';
import { AdminHistoryView } from './views/AdminHistoryView.js';
import { AdminVoicesView } from './views/AdminVoicesView.js';
import { AdminAccountsView } from './views/AdminAccountsView.js';
import { AdminAuditLogsView } from './views/AdminAuditLogsView.js';
import { AdminSettingsView, AdminSettingsTab } from './views/AdminSettingsView.js';
import { useToast } from '../context/ToastContext.js';

interface AdminAppProps {
  onNavigateToStudio: () => void;
}

export const AdminApp: React.FC<AdminAppProps> = ({ onNavigateToStudio }) => {
  const { showToast } = useToast();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [superAdminConfigured, setSuperAdminConfigured] = useState(true);
  const [admin, setAdmin] = useState<AdminAccountPublic | null>(null);
  const [firestoreSync, setFirestoreSync] = useState<FirestoreSyncBannerInfo | null>(null);
  const [firebaseEmail, setFirebaseEmail] = useState<string | null>(() => auth.currentUser?.email || null);
  const [connectingGoogleSync, setConnectingGoogleSync] = useState(false);
  const [syncRevision, setSyncRevision] = useState(0);

  const [activeSection, setActiveSection] = useState<AdminSectionId>('dashboard');
  const [settingsTab, setSettingsTab] = useState<AdminSettingsTab>('general');
  const [quickSearch, setQuickSearch] = useState('');
  const [pendingPaymentsCount, setPendingPaymentsCount] = useState(0);

  const refreshStatus = useCallback(async (silent = false) => {
    if (!silent) setCheckingAuth(true);
    try {
      const status = await adminApi.getAuthStatus();
      setSuperAdminConfigured(status.superAdminConfigured);
      setAdmin(status.authenticated ? status.admin : null);
      setFirestoreSync({
        adminSdkConfigured: Boolean(status.adminSdkConfigured),
        firestoreMode: status.firestoreMode || 'none',
        firestoreConnected: Boolean(status.firestoreConnected),
        lastFirestoreError: status.lastFirestoreError || null,
      });
    } catch {
      if (!silent) setAdmin(null);
    } finally {
      if (!silent) setCheckingAuth(false);
    }
  }, []);

  const refreshPendingPaymentsCount = useCallback(async () => {
    if (!admin || !adminHasPerm(admin, 'payments:view')) return;
    try {
      const res = await adminApi.getPayments({ status: 'pending' });
      setPendingPaymentsCount(res.payments.length);
    } catch {
      // ignore
    }
  }, [admin]);

  const hadSessionRef = React.useRef(false);
  useEffect(() => {
    hadSessionRef.current = Boolean(admin);
  }, [admin]);

  useEffect(() => {
    registerAdminUnauthorizedHandler(() => {
      const wasSignedIn = hadSessionRef.current;
      setAdmin(null);
      if (wasSignedIn) {
        showToast('Admin session expired due to inactivity. Please sign in again.', 'warning');
      }
    });
    void refreshStatus(false);
  }, [refreshStatus, showToast]);

  const prevFbUidRef = React.useRef<string | null>(auth.currentUser?.uid || null);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      const nextUid = fbUser?.uid || null;
      setFirebaseEmail(fbUser?.email || null);
      if (nextUid !== prevFbUidRef.current) {
        prevFbUidRef.current = nextUid;
        await refreshStatus(true);
        setSyncRevision((v) => v + 1);
      }
    });
    return () => unsubscribe();
  }, [refreshStatus]);

  useEffect(() => {
    if (admin) {
      // Ensure activeSection is permitted for this role (Security Change Password under Settings is always allowed)
      const isSecuritySettingsView = activeSection === 'settings' && settingsTab === 'security';
      if (!isSecuritySettingsView) {
        const activeNav = NAV_ITEMS.find((i) => i.id === activeSection);
        if (activeNav && !adminHasPerm(admin, activeNav.permission)) {
          const firstAllowed = NAV_ITEMS.find((i) => adminHasPerm(admin, i.permission));
          if (firstAllowed) setActiveSection(firstAllowed.id);
        }
      }
      void refreshPendingPaymentsCount();
    }
  }, [admin, activeSection, settingsTab, refreshPendingPaymentsCount, syncRevision]);

  const handleConnectGoogleSync = async () => {
    setConnectingGoogleSync(true);
    try {
      const cred = await signInWithGoogle();
      setFirebaseEmail(cred.user?.email || null);
      await refreshStatus(true);
      setSyncRevision((v) => v + 1);
      if (cred.user?.email?.toLowerCase() === 'officeahmadraza@gmail.com') {
        showToast('Connected Google Firebase Sync cleanly.', 'success');
      } else {
        showToast(
          `Signed in as ${cred.user?.email || 'user'}. Use officeahmadraza@gmail.com for full admin Firestore sync.`,
          'warning'
        );
      }
    } catch (err: any) {
      showToast(err?.message || 'Could not complete Google Sign-In for Firestore Sync.', 'error');
    } finally {
      setConnectingGoogleSync(false);
    }
  };

  const handleLogout = async () => {
    await adminApi.logout().catch(() => undefined);
    setAdmin(null);
    setSettingsTab('general');
    showToast('Signed out from Admin Portal.', 'info');
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] dark:bg-[#090C12] flex items-center justify-center text-xs text-[#5A6580] dark:text-[#A2ADC7] gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-[#2E5BFF] dark:text-[#7A9AFF]" />
        <span>Verifying administrator session...</span>
      </div>
    );
  }

  if (!admin) {
    return (
      <AdminLoginView
        superAdminConfigured={superAdminConfigured}
        onLoginSuccess={(loggedIn) => {
          setAdmin(loggedIn);
          void refreshStatus(true);
        }}
        onBackToStudio={onNavigateToStudio}
      />
    );
  }

  return (
    <AdminLayout
      admin={admin}
      activeSection={activeSection}
      onSelectSection={(sec) => {
        if (sec === 'settings') {
          setSettingsTab(adminHasPerm(admin, 'settings:view') ? 'general' : 'security');
        }
        setActiveSection(sec);
        setQuickSearch('');
      }}
      pendingPaymentsCount={pendingPaymentsCount}
      quickSearch={quickSearch}
      onQuickSearchChange={setQuickSearch}
      onOpenChangePassword={() => {
        setSettingsTab('security');
        setActiveSection('settings');
        setQuickSearch('');
      }}
      onLogout={handleLogout}
      onNavigateToStudio={onNavigateToStudio}
      firestoreSync={firestoreSync}
      firebaseEmail={firebaseEmail}
      connectingGoogleSync={connectingGoogleSync}
      onConnectGoogleSync={handleConnectGoogleSync}
    >
      <React.Fragment key={syncRevision}>
        {activeSection === 'dashboard' && (
          <AdminDashboardView onNavigateSection={setActiveSection} />
        )}
        {activeSection === 'users' && <AdminUsersView globalSearch={quickSearch} />}
        {activeSection === 'credits' && <AdminCreditsView globalSearch={quickSearch} />}
        {activeSection === 'payments' && (
          <AdminPaymentsView
            globalSearch={quickSearch}
            onPaymentsChanged={refreshPendingPaymentsCount}
          />
        )}
        {activeSection === 'plans' && <AdminPlansView />}
        {activeSection === 'api' && <AdminApiView />}
        {activeSection === 'projects' && <AdminProjectsView globalSearch={quickSearch} />}
        {activeSection === 'history' && <AdminHistoryView globalSearch={quickSearch} />}
        {activeSection === 'voices' && <AdminVoicesView globalSearch={quickSearch} />}
        {activeSection === 'accounts' && <AdminAccountsView currentAdminId={admin.id} />}
        {activeSection === 'audit' && <AdminAuditLogsView globalSearch={quickSearch} />}
        {activeSection === 'settings' && (
          <AdminSettingsView
            activeTab={settingsTab}
            onTabChange={setSettingsTab}
            canViewGeneral={adminHasPerm(admin, 'settings:view')}
            adminEmail={admin.email}
            onAdminUpdated={setAdmin}
          />
        )}
      </React.Fragment>
    </AdminLayout>
  );
};
