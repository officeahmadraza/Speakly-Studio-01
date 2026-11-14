import React, { useState } from 'react';
import { Check, SlidersHorizontal, HelpCircle, BookOpen, Zap, ShieldCheck, ArrowRight } from 'lucide-react';
import { Modal } from './ui/index.js';
import { CreditLedgerState } from '../types/index.js';
import { PublicPricingPlan } from '../services/userSyncApi.js';

interface PlansModalProps {
  isOpen: boolean;
  onClose: () => void;
  credits: CreditLedgerState;
  plans: PublicPricingPlan[];
  onStartCheckout: (plan: PublicPricingPlan, billingCycle: 'monthly' | 'yearly') => void;
}

export const PlansModal: React.FC<PlansModalProps> = ({
  isOpen,
  onClose,
  credits,
  plans,
  onStartCheckout,
}) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  const displayPlans: PublicPricingPlan[] =
    plans.length > 0
      ? plans
      : [
          {
            id: 'plan_starter',
            name: 'Starter',
            audience: 'For individual creators testing AI voiceovers',
            monthlyPrice: 0,
            yearlyPrice: 0,
            credits: 2500,
            durationDays: 30,
            features: ['2,500 monthly synthesis credits', 'Standard voice actors', 'MP3 & WAV downloads'],
            isActive: true,
            isFeatured: false,
            displayOrder: 1,
          },
        ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Speakly Studio Plans & Credits"
      subtitle="Transparent monthly and annual synthesis plans with instant credit provisioning."
      maxWidthClass="max-w-4xl"
    >
      <div className="space-y-5">
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center p-1 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638]">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`h-8 px-4 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 ${
                billingCycle === 'monthly'
                  ? 'bg-white dark:bg-[#101521] text-[#2E5BFF] dark:text-[#7A9AFF] shadow-xs'
                  : 'text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA]'
              }`}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('yearly')}
              className={`h-8 px-4 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 ${
                billingCycle === 'yearly'
                  ? 'bg-white dark:bg-[#101521] text-[#2E5BFF] dark:text-[#7A9AFF] shadow-xs'
                  : 'text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA]'
              }`}
            >
              Yearly Billing
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {displayPlans.map((plan) => {
            const isCurrent = credits.planName === plan.name;
            const price = billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
            const totalCredits = billingCycle === 'yearly' ? plan.credits * 12 : plan.credits;
            const monthlyEquivalent =
              billingCycle === 'yearly' && plan.yearlyPrice > 0
                ? Math.round((plan.yearlyPrice / 12) * 100) / 100
                : null;
            const savingsPct =
              billingCycle === 'yearly' && plan.monthlyPrice > 0 && plan.yearlyPrice < plan.monthlyPrice * 12
                ? Math.round((1 - plan.yearlyPrice / (plan.monthlyPrice * 12)) * 100)
                : 0;

            return (
              <div
                key={plan.id}
                className={`rounded-2xl p-5 border flex flex-col justify-between gap-5 transition-colors duration-150 ${
                  plan.isFeatured
                    ? 'bg-[#EEF2FF]/55 dark:bg-[#141B2D] border-[#2E5BFF] dark:border-[#4D74FF]'
                    : 'bg-[#F7F8FA] dark:bg-[#0D121D] border-[#E4E7EF] dark:border-[#1E2638]'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                      {plan.name}
                    </span>
                    {plan.isFeatured && (
                      <span className="text-[11px] font-medium text-[#2E5BFF] dark:text-[#7A9AFF]">
                        Recommended
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-display text-2xl font-bold font-mono tabular-nums text-[#11162B] dark:text-[#F3F5FA]">
                        ${price.toLocaleString()}
                      </span>
                      <span className="text-xs text-[#5A6580] dark:text-[#A2ADC7]">
                        / {billingCycle === 'yearly' ? 'yr' : `${plan.durationDays}d`}
                      </span>
                    </div>
                    {monthlyEquivalent !== null && savingsPct > 0 && (
                      <div className="text-[11px] font-mono tabular-nums text-[#16A34A] dark:text-[#22C55E] font-medium mt-0.5">
                        ${monthlyEquivalent}/mo effective · Save {savingsPct}%
                      </div>
                    )}
                  </div>

                  <div className="text-xs font-semibold font-mono tabular-nums text-[#2E5BFF] dark:text-[#7A9AFF]">
                    {totalCredits.toLocaleString()} credits
                  </div>
                  <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] leading-relaxed">
                    {plan.audience}
                  </p>

                  <ul className="space-y-2 pt-3 border-t border-[#E4E7EF] dark:border-[#1E2638]">
                    {plan.features.map((feat) => (
                      <li
                        key={feat}
                        className="flex items-start gap-2 text-xs text-[#11162B] dark:text-[#F3F5FA]"
                      >
                        <Check className="w-3.5 h-3.5 text-[#16A34A] dark:text-[#22C55E] shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStartCheckout(plan, billingCycle);
                  }}
                  className={`w-full h-9 px-4 rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 ${
                    isCurrent
                      ? 'bg-white dark:bg-[#101521] border border-[#2E5BFF] dark:border-[#4D74FF] text-[#2E5BFF] dark:text-[#7A9AFF]'
                      : plan.isFeatured
                      ? 'bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white'
                      : 'bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] hover:border-[#2E5BFF] dark:hover:border-[#4D74FF]'
                  }`}
                >
                  <span>
                    {price === 0
                      ? isCurrent
                        ? 'Current Free Plan'
                        : `Select ${plan.name}`
                      : `Purchase ${plan.name}`}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
};

export const ShortcutsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const shortcuts = [
    { keys: '⌘ / Ctrl + Enter', desc: 'Generate Speech from the Narration Canvas' },
    { keys: '⌘ / Ctrl + K', desc: 'Focus global search across voices & projects' },
    { keys: '⌘ / Ctrl + A', desc: 'Select all text inside the focused script editor' },
    { keys: '⌘ / Ctrl + Z', desc: 'Undo last script edit' },
    { keys: '⌘ / Ctrl + Shift + Z', desc: 'Redo script edit' },
    { keys: 'Escape', desc: 'Close active modal, selector, or popover' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Keyboard Shortcuts"
      subtitle="Navigate and synthesize faster across Speakly Studio."
      maxWidthClass="max-w-lg"
    >
      <div className="divide-y divide-[#E4E7EF] dark:divide-[#1E2638]">
        {shortcuts.map((s) => (
          <div key={s.keys} className="py-3 flex items-center justify-between gap-4">
            <span className="text-xs text-[#11162B] dark:text-[#F3F5FA]">{s.desc}</span>
            <kbd className="px-2.5 py-1 rounded-lg bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[11px] font-mono font-semibold text-[#2E5BFF] dark:text-[#7A9AFF] whitespace-nowrap shrink-0">
              {s.keys}
            </kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
};

export const HelpDocsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'support' | 'docs';
}> = ({ isOpen, onClose, initialTab = 'docs' }) => {
  const [tab, setTab] = useState<'support' | 'docs'>(initialTab);

  React.useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
    }
  }, [initialTab, isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Speakly Studio Help & Documentation"
      subtitle="Workflow guides, OpenSpeaker integration notes, and support."
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-5">
        <div className="flex items-center gap-1 p-1 bg-[#F7F8FA] dark:bg-[#0D121D] rounded-xl w-fit border border-[#E4E7EF] dark:border-[#1E2638]">
          <button
            type="button"
            onClick={() => setTab('docs')}
            className={`h-8 px-3.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 ${
              tab === 'docs'
                ? 'bg-white dark:bg-[#101521] text-[#2E5BFF] dark:text-[#7A9AFF] shadow-xs'
                : 'text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Documentation</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('support')}
            className={`h-8 px-3.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 ${
              tab === 'support'
                ? 'bg-white dark:bg-[#101521] text-[#2E5BFF] dark:text-[#7A9AFF] shadow-xs'
                : 'text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA]'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Help & Support</span>
          </button>
        </div>

        {tab === 'docs' ? (
          <div className="space-y-3 text-xs text-[#11162B] dark:text-[#F3F5FA] leading-relaxed">
            <div className="p-4 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] space-y-1.5">
              <div className="font-display font-semibold flex items-center gap-2 text-[#2E5BFF] dark:text-[#7A9AFF]">
                <Zap className="w-4 h-4" />
                <span>1. Writing Natural Narration Scripts</span>
              </div>
              <p className="text-[#5A6580] dark:text-[#A2ADC7]">
                Use commas, periods, and ellipses (...) to guide natural breathing cadence. Split longer books into organized chapters under My Projects.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] space-y-1.5">
              <div className="font-display font-semibold flex items-center gap-2 text-[#2E5BFF] dark:text-[#7A9AFF]">
                <SlidersHorizontal className="w-4 h-4" />
                <span>2. Supported Speech Parameters</span>
              </div>
              <p className="text-[#5A6580] dark:text-[#A2ADC7]">
                Speakly Studio maps directly to the OpenSpeaker <code className="font-mono">/v3/text-to-speech</code> provider: Pacing / Speed (<code className="font-mono">0.50x</code> to <code className="font-mono">1.50x</code>), custom Output File Name, and downloadable Word-Aligned Transcript (.txt) metadata.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] space-y-1.5">
              <div className="font-display font-semibold flex items-center gap-2 text-[#16A34A] dark:text-[#22C55E]">
                <ShieldCheck className="w-4 h-4" />
                <span>3. Audio Archiving & Account Sync</span>
              </div>
              <p className="text-[#5A6580] dark:text-[#A2ADC7]">
                Projects, favorites, history metadata, and credit balances stay synced to your Google account. Upstream streaming links expire periodically—use the Download button on any player to archive MP3/WAV files locally, or export a JSON backup anytime in Settings.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-[#EEF2FF]/70 dark:bg-[#4D74FF]/10 space-y-2">
              <h4 className="font-display font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                Troubleshooting Speech Generation
              </h4>
              <ul className="space-y-1.5 text-[#5A6580] dark:text-[#A2ADC7] list-disc pl-4">
                <li>Ensure an active Voice Actor is selected before clicking Generate Speech.</li>
                <li>Sign in with Google to activate your account credit balance and cloud project sync.</li>
                <li>Check backend connectivity and catalog sync status inside Settings &rarr; Backup &amp; Provider API.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
