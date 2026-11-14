import React from 'react';
import { Sparkles, Check, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { Modal } from './ui/index.js';

interface GoogleSignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinueWithGoogle: () => Promise<void>;
  isLoading: boolean;
  errorMessage?: string | null;
  welcomeBonusCredits?: number;
  signupBonusEnabled?: boolean;
  siteName?: string;
}

export const GoogleLogoSvg: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

export const GoogleSignInModal: React.FC<GoogleSignInModalProps> = ({
  isOpen,
  onClose,
  onContinueWithGoogle,
  isLoading,
  errorMessage,
  welcomeBonusCredits = 5000,
  signupBonusEnabled = true,
  siteName = 'Speakly Studio',
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Sign In to ${siteName}`}
      subtitle="Verified Google authentication protects credits and syncs your studio across devices."
      maxWidthClass="max-w-md"
    >
      <div className="space-y-5">
        {signupBonusEnabled && welcomeBonusCredits > 0 && (
          <div className="p-4 rounded-xl bg-[#EEF2FF]/75 dark:bg-[#4D74FF]/10 space-y-1.5">
            <div className="font-display flex items-center gap-2 text-xs font-semibold text-[#2E5BFF] dark:text-[#7A9AFF]">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span className="tabular-nums">{welcomeBonusCredits.toLocaleString()} Free Welcome Credits</span>
            </div>
            <p className="text-xs text-[#11162B] dark:text-[#F3F5FA] leading-relaxed">
              Every brand-new Google account automatically receives{' '}
              <span className="font-mono tabular-nums font-semibold text-[#2E5BFF] dark:text-[#7A9AFF]">
                {welcomeBonusCredits.toLocaleString()} credits
              </span>{' '}
              immediately after sign-in—no approval wait required.
            </p>
          </div>
        )}

        <ul className="space-y-2.5 text-xs text-[#11162B] dark:text-[#F3F5FA]">
          <li className="flex items-start gap-2.5">
            <Check className="w-4 h-4 text-[#16A34A] dark:text-[#22C55E] shrink-0 mt-0.5" />
            <span>Synthesize expressive AI voiceovers across 3,000+ voice actors</span>
          </li>
          <li className="flex items-start gap-2.5">
            <Check className="w-4 h-4 text-[#16A34A] dark:text-[#22C55E] shrink-0 mt-0.5" />
            <span>Keep saved narration projects and generation history synced to your account</span>
          </li>
          <li className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#2E5BFF] dark:text-[#7A9AFF] shrink-0 mt-0.5" />
            <span>Existing accounts keep their current balance automatically</span>
          </li>
        </ul>

        {errorMessage && (
          <div className="p-3 rounded-lg bg-[#DC2626]/10 border border-[#DC2626]/25 text-xs text-[#DC2626] dark:text-[#F87171] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => void onContinueWithGoogle()}
            className="w-full h-11 px-4 rounded-xl bg-white dark:bg-[#0D121D] border border-[#CFD6E6] dark:border-[#2C364F] hover:border-[#2E5BFF] dark:hover:border-[#4D74FF] hover:bg-[#F7F8FA] dark:hover:bg-[#171E2E] text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] transition-colors duration-150 flex items-center justify-center gap-2.5 whitespace-nowrap disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#2E5BFF] dark:text-[#7A9AFF]" />
                <span>Completing Google Sign-In...</span>
              </>
            ) : (
              <>
                <GoogleLogoSvg className="w-4 h-4 shrink-0" />
                <span>Continue with Google</span>
              </>
            )}
          </button>

          <p className="text-[11px] text-center text-[#5A6580] dark:text-[#A2ADC7] leading-relaxed">
            Anonymous visitors can browse the voice library and listen to voice previews, while
            speech generation requires verified Google Sign-In.
          </p>
        </div>
      </div>
    </Modal>
  );
};
