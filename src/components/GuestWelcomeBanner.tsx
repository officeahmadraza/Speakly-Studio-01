import React from 'react';
import { Gift, Check, ArrowRight, X, Loader2 } from 'lucide-react';
import { GoogleLogoSvg } from './GoogleSignInModal.js';

interface GuestWelcomeBannerProps {
  welcomeBonusCredits?: number;
  isSigningIn: boolean;
  onClaimWithGoogle: () => void | Promise<void>;
  onDismiss: () => void;
}

export const GuestWelcomeBanner: React.FC<GuestWelcomeBannerProps> = ({
  welcomeBonusCredits = 5000,
  isSigningIn,
  onClaimWithGoogle,
  onDismiss,
}) => {
  const formattedCredits = welcomeBonusCredits.toLocaleString();

  return (
    <section
      aria-label="First-time guest welcome credit offer"
      className="relative rounded-2xl border border-[#E4E7EF] dark:border-[#1E2638] bg-white dark:bg-[#101521] p-5 sm:p-6 lg:p-7"
    >
      {/* Top-Right Persistent Dismiss Action */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss welcome offer"
        title="Dismiss welcome offer"
        className="absolute top-3.5 right-3.5 z-10 min-w-[34px] min-h-[34px] p-1.5 rounded-xl text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-white hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] transition-colors flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pr-6 lg:pr-0">
        {/* Left: Offer Message, Explanation & Direct Google CTA */}
        <div className="flex-1 max-w-2xl space-y-3.5">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#2E5BFF] dark:text-[#7A9AFF]">
              <Gift className="w-3.5 h-3.5 shrink-0" />
              <span>New Creator Welcome Offer · Instant Activation</span>
            </div>

            <h2 className="font-display text-xl sm:text-2xl lg:text-[26px] font-bold tracking-tight text-[#11162B] dark:text-[#F3F5FA] leading-snug text-balance">
              Unlock{' '}
              <span className="text-[#2E5BFF] dark:text-[#7A9AFF] font-extrabold tabular-nums">
                {formattedCredits} Free Credits
              </span>{' '}
              for Studio Synthesis
            </h2>

            <p className="text-xs sm:text-sm text-[#5A6580] dark:text-[#A2ADC7] leading-relaxed max-w-xl">
              Sign in with Google to activate{' '}
              <strong className="font-semibold text-[#11162B] dark:text-[#F3F5FA] tabular-nums">
                {formattedCredits} complimentary credits
              </strong>{' '}
              and sync projects, custom voice favorites, and generated audio across sessions.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-0.5">
            <button
              type="button"
              disabled={isSigningIn}
              onClick={() => void onClaimWithGoogle()}
              className="group inline-flex items-center justify-center gap-2.5 min-h-[42px] px-4 sm:px-5 py-2 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs sm:text-sm font-bold active:scale-[0.99] transition-all cursor-pointer disabled:opacity-65 disabled:cursor-not-allowed sm:whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/50"
            >
              {isSigningIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>Connecting with Google...</span>
                </>
              ) : (
                <>
                  <span className="w-5 h-5 rounded-md bg-white flex items-center justify-center shrink-0">
                    <GoogleLogoSvg className="w-3.5 h-3.5" />
                  </span>
                  <span>Continue with Google — Claim {formattedCredits} Credits</span>
                  <ArrowRight className="w-3.5 h-3.5 text-white/90 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </div>

          <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-[#16A34A] dark:text-[#22C55E] shrink-0" />
            <span>No credit card required · Credits apply immediately upon sign-in</span>
          </p>
        </div>

        {/* Right: Clean Hairline-Separated Credits Summary */}
        <div className="shrink-0 pt-4 border-t border-[#E4E7EF] dark:border-[#1E2638] lg:pt-0 lg:border-t-0 lg:border-l lg:pl-7 lg:pr-8 flex sm:flex-row lg:flex-col items-start sm:items-center lg:items-start justify-between gap-4 min-w-[240px]">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] flex items-center justify-center shrink-0">
              <Gift className="w-5 h-5" />
            </div>

            <div>
              <div className="font-mono tabular-nums text-2xl sm:text-3xl font-extrabold tracking-tight text-[#11162B] dark:text-[#F3F5FA] leading-none">
                {formattedCredits}
              </div>
              <div className="text-xs font-semibold text-[#5A6580] dark:text-[#A2ADC7] mt-1">
                Free welcome credits
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-xs text-[#5A6580] dark:text-[#A2ADC7]">
            <span className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-[#16A34A] dark:text-[#22C55E] shrink-0" />
              <span>Added automatically on sign-up</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-[#16A34A] dark:text-[#22C55E] shrink-0" />
              <span>Access all 3,000+ neural voices</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
