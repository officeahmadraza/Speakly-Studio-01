import React, { useState } from 'react';
import {
  Shield,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  KeyRound,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import { adminApi } from '../api.js';
import { AdminAccountPublic } from '../types.js';

interface AdminLoginViewProps {
  superAdminConfigured: boolean;
  onLoginSuccess: (admin: AdminAccountPublic) => void;
  onBackToStudio: () => void;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  superAdminConfigured,
  onLoginSuccess,
  onBackToStudio,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password Reset flow
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [resetEmail, setResetEmail] = useState('');
  const [verificationSecret, setVerificationSecret] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await adminApi.login(email.trim(), password);
      onLoginSuccess(res.admin);
    } catch (err: any) {
      setError(err.message || 'Invalid administrator email or password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await adminApi.requestPasswordReset(resetEmail.trim());
      setResetMessage(res.message);
      setResetStep('confirm');
    } catch (err: any) {
      setError(err.message || 'Could not process reset request.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await adminApi.confirmPasswordReset(
        resetEmail.trim(),
        verificationSecret,
        newPassword
      );
      setResetMessage(res.message);
      setMode('login');
      setPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] dark:bg-[#090C12] flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-5 animate-studio-enter">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-11 h-11 rounded-xl bg-[#2E5BFF] dark:bg-[#4D74FF] text-white flex items-center justify-center mx-auto">
            <Shield className="w-5 h-5" />
          </div>
          <h1 className="font-display text-xl font-bold text-[#11162B] dark:text-[#F3F5FA]">
            Speakly Studio Super Admin
          </h1>
          <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7]">
            Restricted control plane · Server-authenticated session required
          </p>
        </div>

        {/* Setup Warning if ADMIN_PASSWORD is not configured */}
        {!superAdminConfigured && (
          <div className="p-4 rounded-xl bg-[#D97706]/10 border border-[#D97706]/30 text-xs text-[#9A5B04] dark:text-[#F59E0B] space-y-1.5">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>ADMIN_PASSWORD Environment Secret Required</span>
            </div>
            <p className="leading-relaxed">
              The initial Super Admin account requires the{' '}
              <code className="font-mono font-semibold">ADMIN_PASSWORD</code> environment variable
              to be set in your server / AI Studio Secrets configuration before the first login.
            </p>
          </div>
        )}

        {/* Auth Card */}
        <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-6 space-y-5">
          {resetMessage && (
            <div className="p-3 rounded-lg bg-[#16A34A]/10 border border-[#16A34A]/25 text-xs text-[#16A34A] dark:text-[#22C55E] flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{resetMessage}</span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-[#DC2626]/10 border border-[#DC2626]/25 text-xs text-[#DC2626] dark:text-[#F87171] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#11162B] dark:text-[#F3F5FA] mb-1.5">
                  Administrator Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#78839E] dark:text-[#7C87A3] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter administrator email"
                    autoComplete="email"
                    className="w-full h-10 pl-10 pr-4 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:bg-white dark:focus:bg-[#101521] focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] focus:ring-2 focus:ring-[#2E5BFF]/15"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-[#11162B] dark:text-[#F3F5FA]">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setResetMessage(null);
                      setResetStep('request');
                      setMode('reset');
                    }}
                    className="text-[11px] font-medium text-[#2E5BFF] dark:text-[#7A9AFF] hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#78839E] dark:text-[#7C87A3] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPwd ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter administrator password"
                    autoComplete="current-password"
                    className="w-full h-10 pl-10 pr-10 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:bg-white dark:focus:bg-[#101521] focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] focus:ring-2 focus:ring-[#2E5BFF]/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#78839E] hover:text-[#11162B] dark:hover:text-[#F3F5FA] cursor-pointer"
                    aria-label={showPwd ? 'Hide password' : 'Show password'}
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !superAdminConfigured}
                className="w-full h-10 rounded-lg bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
              >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Sign In to Admin Portal</span>
              </button>
            </form>
          ) : resetStep === 'request' ? (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <div className="font-display text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-[#2E5BFF] dark:text-[#7A9AFF]" />
                <span>Reset Administrator Password</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#11162B] dark:text-[#F3F5FA] mb-1.5">
                  Administrator Email
                </label>
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="Enter administrator email"
                  className="w-full h-10 px-3.5 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] focus:ring-2 focus:ring-[#2E5BFF]/15"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-xs font-medium text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] cursor-pointer"
                >
                  Back to Login
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="h-9 px-4 rounded-lg bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-medium flex items-center gap-2 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
                >
                  {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Continue Reset</span>
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleConfirmReset} className="space-y-3.5">
              <div className="font-display text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                Confirm Password Reset
              </div>
              <div>
                <label className="block text-xs font-medium text-[#11162B] dark:text-[#F3F5FA] mb-1">
                  Reset Token or Server ADMIN_PASSWORD (Root Super Admin)
                </label>
                <input
                  type="password"
                  required
                  value={verificationSecret}
                  onChange={(e) => setVerificationSecret(e.target.value)}
                  placeholder="Enter verification secret"
                  className="w-full h-10 px-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#11162B] dark:text-[#F3F5FA] mb-1">
                  New Password (min 10 chars, mixed case + digits/symbols)
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full h-10 px-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#11162B] dark:text-[#F3F5FA] mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full h-10 px-3 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-xs font-medium text-[#5A6580] dark:text-[#A2ADC7] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="h-9 px-4 rounded-lg bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-medium flex items-center gap-2 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
                >
                  {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save New Password</span>
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={onBackToStudio}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#2E5BFF] dark:hover:text-[#7A9AFF] cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Speakly Studio</span>
          </button>
        </div>
      </div>
    </div>
  );
};
