import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Edit3, Trash2, Star, Check, Power, Loader2 } from 'lucide-react';
import { adminApi } from '../api.js';
import { AdminPlanRecord } from '../types.js';
import { useToast } from '../../context/ToastContext.js';
import { Modal } from '../../components/ui/index.js';

export const AdminPlansView: React.FC = () => {
  const { showToast } = useToast();
  const [plans, setPlans] = useState<AdminPlanRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<AdminPlanRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminPlanRecord | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [audience, setAudience] = useState('');
  const [monthlyPrice, setMonthlyPrice] = useState('0');
  const [yearlyPrice, setYearlyPrice] = useState('0');
  const [credits, setCredits] = useState('2500');
  const [durationDays, setDurationDays] = useState('30');
  const [featuresText, setFeaturesText] = useState('');
  const [displayOrder, setDisplayOrder] = useState('1');
  const [isFeatured, setIsFeatured] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getPlans();
      setPlans(res.plans);
    } catch (err: any) {
      showToast(err.message || 'Failed to load pricing plans.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreateModal = () => {
    setEditingPlan(null);
    setName('');
    setAudience('');
    setMonthlyPrice('19');
    setYearlyPrice('190');
    setCredits('10000');
    setDurationDays('30');
    setFeaturesText('10,000 synthesis credits\nPriority queue\nFull voice catalog');
    setDisplayOrder(String(plans.length + 1));
    setIsFeatured(false);
    setIsActive(true);
    setEditModalOpen(true);
  };

  const openEditModal = (plan: AdminPlanRecord) => {
    setEditingPlan(plan);
    setName(plan.name);
    setAudience(plan.audience);
    setMonthlyPrice(String(plan.monthlyPrice));
    setYearlyPrice(String(plan.yearlyPrice));
    setCredits(String(plan.credits));
    setDurationDays(String(plan.durationDays));
    setFeaturesText(plan.features.join('\n'));
    setDisplayOrder(String(plan.displayOrder));
    setIsFeatured(plan.isFeatured);
    setIsActive(plan.isActive);
    setEditModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        audience: audience.trim(),
        monthlyPrice: Number(monthlyPrice),
        yearlyPrice: Number(yearlyPrice),
        credits: Number(credits),
        durationDays: Number(durationDays),
        features: featuresText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        displayOrder: Number(displayOrder) || 1,
        isFeatured,
        isActive,
      };
      if (editingPlan) {
        await adminApi.updatePlan(editingPlan.id, payload);
        showToast(`Updated plan "${payload.name}".`, 'success');
      } else {
        await adminApi.createPlan(payload);
        showToast(`Created plan "${payload.name}".`, 'success');
      }
      setEditModalOpen(false);
      await load();
    } catch (err: any) {
      showToast(err.message || 'Failed to save pricing plan.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (plan: AdminPlanRecord) => {
    try {
      await adminApi.updatePlan(plan.id, { isActive: !plan.isActive });
      showToast(`${plan.name} ${plan.isActive ? 'disabled' : 'enabled'}.`, 'info');
      await load();
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle plan status.', 'error');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await adminApi.deletePlan(deleteTarget.id);
      showToast(`Deleted plan "${deleteTarget.name}".`, 'info');
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete plan.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7]">
          Active plans automatically appear inside the Speakly Studio Upgrade &amp; Checkout modals.
        </p>
        <button
          type="button"
          onClick={openCreateModal}
          className="h-9 px-4 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 dark:focus-visible:ring-[#4D74FF]/40"
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span>New Pricing Plan</span>
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-[#5A6580] dark:text-[#A2ADC7]">Loading plans...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white dark:bg-[#101521] border rounded-2xl p-5 flex flex-col justify-between gap-4 transition-colors duration-150 ${
                plan.isFeatured
                  ? 'border-[#2E5BFF] dark:border-[#4D74FF]'
                  : 'border-[#E4E7EF] dark:border-[#1E2638]'
              } ${!plan.isActive ? 'opacity-65' : ''}`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-base font-bold text-[#11162B] dark:text-[#F3F5FA]">{plan.name}</h3>
                      {plan.isFeatured && (
                        <Star className="w-3.5 h-3.5 text-[#D97706] fill-[#D97706] dark:text-[#F59E0B] dark:fill-[#F59E0B] shrink-0" />
                      )}
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-[#5A6580] dark:text-[#A2ADC7]">
                      Order #{plan.displayOrder} · {plan.isActive ? 'Active' : 'Disabled'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditModal(plan)}
                      title="Edit Plan"
                      className="p-1.5 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(plan)}
                      title={plan.isActive ? 'Disable Plan' : 'Enable Plan'}
                      className={`p-1.5 rounded-lg transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 ${
                        plan.isActive
                          ? 'hover:bg-[#D97706]/12 text-[#16A34A] dark:text-[#22C55E]'
                          : 'hover:bg-[#16A34A]/12 text-[#5A6580] dark:text-[#A2ADC7]'
                      }`}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(plan)}
                      title="Delete Plan"
                      className="p-1.5 rounded-lg hover:bg-[#DC2626]/12 text-[#DC2626] dark:text-[#F87171] transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]/40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-baseline gap-3 font-mono tabular-nums">
                  <span className="font-display text-2xl font-bold text-[#11162B] dark:text-[#F3F5FA]">${plan.monthlyPrice}/mo</span>
                  <span className="text-xs text-[#5A6580] dark:text-[#A2ADC7]">${plan.yearlyPrice}/yr</span>
                </div>

                <div className="text-xs font-mono tabular-nums font-semibold text-[#2E5BFF] dark:text-[#7A9AFF]">
                  {plan.credits.toLocaleString()} credits / {plan.durationDays} days
                </div>
                <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7]">{plan.audience}</p>

                <ul className="space-y-1.5 pt-2.5 border-t border-[#E4E7EF] dark:border-[#1E2638]">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-[#11162B] dark:text-[#F3F5FA]">
                      <Check className="w-3.5 h-3.5 text-[#16A34A] dark:text-[#22C55E] shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Plan Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={editingPlan ? `Edit Plan: ${editingPlan.name}` : 'Create Pricing Plan'}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSave} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Plan Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Display Order</label>
              <input
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] font-mono tabular-nums focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Audience Subtitle</label>
            <input
              type="text"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Monthly ($)</label>
              <input
                type="number"
                min={0}
                value={monthlyPrice}
                onChange={(e) => setMonthlyPrice(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] font-mono tabular-nums focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Yearly ($)</label>
              <input
                type="number"
                min={0}
                value={yearlyPrice}
                onChange={(e) => setYearlyPrice(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] font-mono tabular-nums focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Credits</label>
              <input
                type="number"
                min={0}
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] font-mono tabular-nums focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Days</label>
              <input
                type="number"
                min={1}
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] font-mono tabular-nums focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Included Features (one per line)</label>
            <textarea
              rows={4}
              value={featuresText}
              onChange={(e) => setFeaturesText(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            />
          </div>

          <div className="flex items-center gap-6 text-[#5A6580] dark:text-[#A2ADC7]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="accent-[#2E5BFF] dark:accent-[#4D74FF]"
              />
              <span>Active (visible to users)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                className="accent-[#2E5BFF] dark:accent-[#4D74FF]"
              />
              <span>Featured / Popular</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditModalOpen(false)}
              className="h-9 px-4 rounded-xl border border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] font-semibold transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 px-5 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white font-semibold flex items-center gap-2 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Plan</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Plan Confirm */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Pricing Plan"
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[#5A6580] dark:text-[#A2ADC7]">
            Are you sure you want to delete <strong className="text-[#11162B] dark:text-[#F3F5FA]">{deleteTarget?.name}</strong>? Existing users on
            this plan keep their remaining credits safely.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="h-9 px-4 rounded-xl border border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] font-semibold transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirm}
              className="h-9 px-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-semibold transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Delete Plan
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
