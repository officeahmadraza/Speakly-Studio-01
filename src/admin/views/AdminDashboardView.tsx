import React, { useEffect, useState, useCallback } from 'react';
import {
  Users,
  DollarSign,
  Coins,
  CreditCard,
  Mic,
  FolderKanban,
  Activity,
  RefreshCw,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { adminApi } from '../api.js';
import { AdminOverviewData, AdminSectionId } from '../types.js';
import { AreaTrendChart, DonutDistributionChart } from '../components/AdminCharts.js';

interface AdminDashboardViewProps {
  onNavigateSection: (section: AdminSectionId) => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({ onNavigateSection }) => {
  const [days, setDays] = useState<number>(14);
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getOverview(days);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard overview.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-2xl bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638]"
          />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-2xl bg-white dark:bg-[#101521] border border-[#DC2626]/30 text-sm text-[#DC2626] dark:text-[#F87171] flex items-center justify-between gap-4">
        <span>{error || 'Unable to load platform overview.'}</span>
        <button
          type="button"
          onClick={load}
          className="h-9 px-4 rounded-lg bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const { kpis, charts } = data;

  const statCards = [
    {
      label: 'Total Revenue',
      value: `$${kpis.totalRevenueUsd.toLocaleString()}`,
      sub: `${kpis.approvedPayments} approved · ${kpis.pendingPayments} pending · ${kpis.rejectedPayments} rejected`,
      icon: DollarSign,
      color: 'text-[#16A34A] dark:text-[#22C55E] bg-[#16A34A]/10',
      section: 'payments' as AdminSectionId,
    },
    {
      label: 'Registered Users',
      value: kpis.totalUsers.toLocaleString(),
      sub: `${kpis.activeUsers} active · ${kpis.suspendedUsers} suspended`,
      icon: Users,
      color: 'text-[#2E5BFF] dark:text-[#7A9AFF] bg-[#EEF2FF] dark:bg-[#4D74FF]/14',
      section: 'users' as AdminSectionId,
    },
    {
      label: 'Credits Remaining',
      value: kpis.totalRemainingCredits.toLocaleString(),
      sub: `${kpis.totalCreditsPurchased.toLocaleString()} purchased · ${kpis.totalCreditsConsumed.toLocaleString()} consumed`,
      icon: Coins,
      color: 'text-[#2E5BFF] dark:text-[#7A9AFF] bg-[#EEF2FF] dark:bg-[#4D74FF]/14',
      section: 'credits' as AdminSectionId,
    },
    {
      label: 'Active Subscriptions',
      value: kpis.activeSubscriptions.toLocaleString(),
      sub: `${kpis.pendingPayments} awaiting payment approval`,
      icon: CreditCard,
      color: 'text-[#D97706] dark:text-[#F59E0B] bg-[#D97706]/10',
      section: 'payments' as AdminSectionId,
    },
    {
      label: 'Speech Generations',
      value: kpis.totalSpeechGenerations.toLocaleString(),
      sub: 'Live database records',
      icon: Mic,
      color: 'text-[#2E5BFF] dark:text-[#7A9AFF] bg-[#EEF2FF] dark:bg-[#4D74FF]/14',
      section: 'history' as AdminSectionId,
    },
    {
      label: 'Total Projects',
      value: kpis.totalProjects.toLocaleString(),
      sub: 'Saved scripts & narration workspaces',
      icon: FolderKanban,
      color: 'text-[#0284C7] dark:text-[#38BDF8] bg-[#0EA5E9]/10',
      section: 'projects' as AdminSectionId,
    },
    {
      label: 'API Usage & Cost',
      value: `${kpis.totalApiCalls.toLocaleString()} calls`,
      sub: `Est. $${kpis.totalEstimatedApiCostUsd.toFixed(4)} · ${kpis.recentApiErrorsCount} recent errors`,
      icon: Activity,
      color: 'text-[#16A34A] dark:text-[#22C55E] bg-[#16A34A]/10',
      section: 'api' as AdminSectionId,
    },
    {
      label: 'Welcome Bonus Distributed',
      value: (kpis.totalWelcomeCreditsDistributed || 0).toLocaleString(),
      sub: `${(kpis.welcomeBonusRecipientsCount || 0).toLocaleString()} verified Google accounts · ${kpis.totalCreditsConsumed.toLocaleString()} consumed`,
      icon: Coins,
      color: 'text-[#16A34A] dark:text-[#22C55E] bg-[#16A34A]/10',
      section: 'credits' as AdminSectionId,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-[#11162B] dark:text-[#F3F5FA]">
            Real-Time Platform Metrics
          </h2>
          <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7]">
            Computed directly from live database collections
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex p-1 rounded-xl bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638]">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-3 py-1 rounded-lg text-xs font-mono tabular-nums font-semibold whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer ${
                  days === d
                    ? 'bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF]'
                    : 'text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA]'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="h-9 px-3 rounded-lg bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] text-xs font-medium text-[#11162B] dark:text-[#F3F5FA] flex items-center gap-1.5 hover:border-[#2E5BFF] dark:hover:border-[#4D74FF] whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => onNavigateSection(card.section)}
              className="text-left bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] hover:border-[#2E5BFF]/60 dark:hover:border-[#4D74FF]/60 rounded-2xl p-4.5 transition-colors duration-150 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-[#5A6580] dark:text-[#A2ADC7]">
                  {card.label}
                </span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="font-display text-2xl font-bold font-mono tabular-nums text-[#11162B] dark:text-[#F3F5FA]">
                {card.value}
              </div>
              <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] mt-1 truncate">
                {card.sub}
              </div>
            </button>
          );
        })}
      </div>

      {/* Interactive Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <AreaTrendChart
          title="Revenue Over Time"
          subtitle="Approved subscription & credit purchases (USD)"
          data={charts.revenueOverTime}
          color="#16A34A"
          valueFormatter={(v) => `$${v.toLocaleString()}`}
        />
        <AreaTrendChart
          title="User Registration Trends"
          subtitle="New user sign-ups per day"
          data={charts.registrationTrends}
          color="#2E5BFF"
          valueFormatter={(v) => `${v} users`}
        />
      </div>

      {/* Interactive Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <AreaTrendChart
          title="Credit Consumption"
          subtitle="Daily credits deducted across syntheses"
          data={charts.creditConsumption}
          color="#0EA5E9"
          valueFormatter={(v) => `${v.toLocaleString()} cr`}
        />
        <AreaTrendChart
          title="Speech Generation Activity"
          subtitle="Syntheses initiated per day"
          data={charts.speechActivity}
          color="#2E5BFF"
          valueFormatter={(v) => `${v} jobs`}
        />
        <DonutDistributionChart
          title="Subscription Distribution"
          subtitle="Users grouped by active plan tier"
          items={charts.subscriptionDistribution}
        />
      </div>

      {/* Recent Activity Feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent Registrations */}
        <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-[#11162B] dark:text-[#F3F5FA]">
              Recent Registrations
            </h3>
            <button
              type="button"
              onClick={() => onNavigateSection('users')}
              className="text-xs font-medium text-[#2E5BFF] dark:text-[#7A9AFF] flex items-center gap-1 cursor-pointer hover:underline"
            >
              <span>View all</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {data.recentRegistrations.length === 0 ? (
            <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] py-6 text-center">No registered users yet.</p>
          ) : (
            <div className="divide-y divide-[#E4E7EF] dark:divide-[#1E2638]">
              {data.recentRegistrations.map((u) => (
                <div key={u.uid} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#11162B] dark:text-[#F3F5FA] truncate">{u.displayName}</div>
                    <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] truncate">{u.email}</div>
                  </div>
                  <span className="font-mono text-[11px] font-semibold text-[#2E5BFF] dark:text-[#7A9AFF] shrink-0">
                    {u.planName}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-[#11162B] dark:text-[#F3F5FA]">
              Recent Transactions
            </h3>
            <button
              type="button"
              onClick={() => onNavigateSection('payments')}
              className="text-xs font-medium text-[#2E5BFF] dark:text-[#7A9AFF] flex items-center gap-1 cursor-pointer hover:underline"
            >
              <span>Review</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {data.recentTransactions.length === 0 ? (
            <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] py-6 text-center">No payment transactions yet.</p>
          ) : (
            <div className="divide-y divide-[#E4E7EF] dark:divide-[#1E2638]">
              {data.recentTransactions.map((p) => (
                <div key={p.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#11162B] dark:text-[#F3F5FA] truncate">
                      {p.userName || p.userEmail} · <span className="font-mono tabular-nums">${p.amountUsd}</span>
                    </div>
                    <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] font-mono truncate">
                      {p.planName} · {p.transactionId}
                    </div>
                  </div>
                  <span className="shrink-0">
                    {p.status === 'pending' && <Clock className="w-4 h-4 text-[#D97706] dark:text-[#F59E0B]" />}
                    {p.status === 'approved' && <CheckCircle2 className="w-4 h-4 text-[#16A34A] dark:text-[#22C55E]" />}
                    {p.status === 'rejected' && <XCircle className="w-4 h-4 text-[#DC2626] dark:text-[#F87171]" />}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Admin Activities */}
        <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-[#11162B] dark:text-[#F3F5FA]">
              Recent Admin Activities
            </h3>
            <button
              type="button"
              onClick={() => onNavigateSection('audit')}
              className="text-xs font-medium text-[#2E5BFF] dark:text-[#7A9AFF] flex items-center gap-1 cursor-pointer hover:underline"
            >
              <span>Audit trail</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {data.recentActivities.length === 0 ? (
            <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] py-6 text-center">No admin activity recorded yet.</p>
          ) : (
            <div className="divide-y divide-[#E4E7EF] dark:divide-[#1E2638]">
              {data.recentActivities.map((a) => (
                <div key={a.id} className="py-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-[11px] text-[#2E5BFF] dark:text-[#7A9AFF]">
                      {a.action}
                    </span>
                    <span className="text-[10px] text-[#78839E] dark:text-[#7C87A3] font-mono tabular-nums">
                      {new Date(a.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] truncate mt-0.5">
                    {a.adminEmail} &rarr; {a.targetType}:{a.targetId}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
