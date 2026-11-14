import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Search, Plus, Edit3, Power, RefreshCw, Loader2, CheckCircle2, Ban } from 'lucide-react';
import { adminApi } from '../api.js';
import { AdminVoiceRecord, AdminPlanRecord } from '../types.js';
import { useToast } from '../../context/ToastContext.js';
import { Modal } from '../../components/ui/index.js';

export const AdminVoicesView: React.FC<{ globalSearch?: string }> = ({ globalSearch = '' }) => {
  const { showToast } = useToast();
  const [voices, setVoices] = useState<AdminVoiceRecord[]>([]);
  const [plans, setPlans] = useState<AdminPlanRecord[]>([]);
  const [counts, setCounts] = useState({ totalCount: 0, disabledCount: 0, customCount: 0 });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(globalSearch);
  const [filterMode, setFilterMode] = useState<'all' | 'enabled' | 'disabled' | 'custom'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingVoice, setEditingVoice] = useState<AdminVoiceRecord | null>(null);
  const [saving, setSaving] = useState(false);

  // Form
  const [voiceIdInput, setVoiceIdInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [languageInput, setLanguageInput] = useState('');
  const [accentInput, setAccentInput] = useState('');
  const [genderInput, setGenderInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [previewInput, setPreviewInput] = useState('');
  const [allowedPlans, setAllowedPlans] = useState<string[]>([]);

  useEffect(() => {
    setQ(globalSearch);
  }, [globalSearch]);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      try {
        const [vRes, pRes] = await Promise.all([adminApi.getVoices(refresh), adminApi.getPlans()]);
        setVoices(vRes.voices);
        setCounts({
          totalCount: vRes.totalCount,
          disabledCount: vRes.disabledCount,
          customCount: vRes.customCount,
        });
        setPlans(pRes.plans);
      } catch (err: any) {
        showToast(err.message || 'Failed to load voice library.', 'error');
      } finally {
        setLoading(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return voices
      .filter((v) => {
        if (filterMode === 'enabled' && !v.enabled) return false;
        if (filterMode === 'disabled' && v.enabled) return false;
        if (filterMode === 'custom' && !v.isCustomAdded) return false;
        if (!term) return true;
        return (
          v.name.toLowerCase().includes(term) ||
          v.id.toLowerCase().includes(term) ||
          (v.language || '').toLowerCase().includes(term) ||
          (v.category || '').toLowerCase().includes(term)
        );
      })
      .slice(0, 120);
  }, [voices, q, filterMode]);

  const openAddCustom = () => {
    setEditingVoice(null);
    setVoiceIdInput('');
    setNameInput('');
    setCategoryInput('custom');
    setLanguageInput('English');
    setAccentInput('American');
    setGenderInput('female');
    setDescInput('');
    setPreviewInput('');
    setAllowedPlans([]);
    setModalOpen(true);
  };

  const openEdit = (v: AdminVoiceRecord) => {
    setEditingVoice(v);
    setVoiceIdInput(v.id);
    setNameInput(v.name);
    setCategoryInput(v.category || '');
    setLanguageInput(v.language || '');
    setAccentInput(v.accent || '');
    setGenderInput(v.gender || '');
    setDescInput(v.description || '');
    setPreviewInput(v.previewUrl || '');
    setAllowedPlans(v.allowedPlans || []);
    setModalOpen(true);
  };

  const handleToggleEnabled = async (v: AdminVoiceRecord) => {
    try {
      await adminApi.updateVoice(v.id, { enabled: !v.enabled });
      showToast(`${v.name} ${v.enabled ? 'disabled' : 'enabled'} in public studio.`, 'info');
      await load(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to update voice.', 'error');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingVoice) {
        await adminApi.updateVoice(editingVoice.id, {
          customName: nameInput.trim(),
          customCategory: categoryInput.trim(),
          customLanguage: languageInput.trim(),
          customAccent: accentInput.trim(),
          customGender: genderInput.trim(),
          customDescription: descInput.trim(),
          customPreviewUrl: previewInput.trim(),
          allowedPlans,
        });
        showToast(`Updated voice metadata for "${nameInput}".`, 'success');
      } else {
        await adminApi.createVoice({
          voiceId: voiceIdInput.trim() || undefined,
          name: nameInput.trim(),
          category: categoryInput.trim(),
          language: languageInput.trim(),
          accent: accentInput.trim(),
          gender: genderInput.trim(),
          description: descInput.trim(),
          previewUrl: previewInput.trim() || undefined,
          allowedPlans,
        });
        showToast(`Added custom voice "${nameInput}".`, 'success');
      }
      setModalOpen(false);
      await load(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to save voice.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleAllowedPlan = (planId: string) => {
    setAllowedPlans((prev) =>
      prev.includes(planId) ? prev.filter((id) => id !== planId) : [...prev, planId]
    );
  };

  return (
    <div className="space-y-5">
      {/* Top stats + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-[#5A6580] dark:text-[#A2ADC7]">
          <span>
            Total: <strong className="text-[#11162B] dark:text-[#F3F5FA]">{counts.totalCount}</strong>
          </span>
          <span>
            Custom: <strong className="text-[#11162B] dark:text-[#F3F5FA]">{counts.customCount}</strong>
          </span>
          <span className="text-[#DC2626] dark:text-[#F87171]">
            Disabled: <strong>{counts.disabledCount}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading}
            className="h-9 px-3 rounded-xl bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync Upstream</span>
          </button>
          <button
            type="button"
            onClick={openAddCustom}
            className="h-9 px-4 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 dark:focus-visible:ring-[#4D74FF]/40"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Add Custom Voice</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#78839E] dark:text-[#7C87A3] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search voice name, ID, category, or language..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
          />
        </div>
        <select
          value={filterMode}
          onChange={(e) => setFilterMode(e.target.value as any)}
          className="h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
        >
          <option value="all">All Voices</option>
          <option value="enabled">Enabled Only</option>
          <option value="disabled">Disabled Only</option>
          <option value="custom">Custom Added</option>
        </select>
      </div>

      {/* Voices Table */}
      <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E4E7EF] dark:border-[#1E2638] bg-[#F7F8FA] dark:bg-[#0D121D] text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">
                <th className="py-2.5 px-4 font-semibold">Voice</th>
                <th className="py-2.5 px-4 font-semibold">Category / Metadata</th>
                <th className="py-2.5 px-4 font-semibold">Plan Access</th>
                <th className="py-2.5 px-4 font-semibold">Status</th>
                <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EF] dark:divide-[#1E2638]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-[#5A6580] dark:text-[#A2ADC7]">
                    Loading voice catalog...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-[#5A6580] dark:text-[#A2ADC7]">
                    No voices match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((v) => (
                  <tr
                    key={v.id}
                    className={`hover:bg-[#F2F4F8]/70 dark:hover:bg-[#171E2E]/60 transition-colors duration-150 ${!v.enabled ? 'opacity-60' : ''}`}
                  >
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                        {v.name}{' '}
                        {v.isCustomAdded && (
                          <span className="ml-1 text-[10px] font-semibold text-[#2E5BFF] dark:text-[#7A9AFF]">(Custom)</span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-[#78839E] dark:text-[#7C87A3]">{v.id}</div>
                    </td>
                    <td className="py-2.5 px-4 text-[#5A6580] dark:text-[#A2ADC7] capitalize">
                      {[v.category, v.language, v.accent, v.gender].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-[11px] text-[#11162B] dark:text-[#F3F5FA]">
                      {v.allowedPlans.length === 0
                        ? 'All Plans'
                        : plans
                            .filter((p) => v.allowedPlans.includes(p.id))
                            .map((p) => p.name)
                            .join(', ') || 'Restricted'}
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
                          v.enabled
                            ? 'text-[#16A34A] dark:text-[#22C55E]'
                            : 'text-[#DC2626] dark:text-[#F87171]'
                        }`}
                      >
                        {v.enabled ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <Ban className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{v.enabled ? 'Enabled' : 'Disabled'}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(v)}
                          title="Edit Metadata & Plan Tier"
                          className="p-1.5 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleEnabled(v)}
                          title={v.enabled ? 'Disable Voice' : 'Enable Voice'}
                          className={`p-1.5 rounded-lg cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 ${
                            v.enabled
                              ? 'hover:bg-[#DC2626]/12 text-[#16A34A] dark:text-[#22C55E]'
                              : 'hover:bg-[#16A34A]/12 text-[#5A6580] dark:text-[#A2ADC7]'
                          }`}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Voice Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingVoice ? `Edit Voice: ${editingVoice.name}` : 'Add Custom Voice Actor'}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSave} className="space-y-3 text-xs">
          {!editingVoice && (
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">
                Provider Voice ID (optional)
              </label>
              <input
                type="text"
                value={voiceIdInput}
                onChange={(e) => setVoiceIdInput(e.target.value)}
                placeholder="elevenlabs_..."
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] font-mono focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Display Name *</label>
              <input
                type="text"
                required
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Category</label>
              <input
                type="text"
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Language</label>
              <input
                type="text"
                value={languageInput}
                onChange={(e) => setLanguageInput(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Accent</label>
              <input
                type="text"
                value={accentInput}
                onChange={(e) => setAccentInput(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Gender</label>
              <input
                type="text"
                value={genderInput}
                onChange={(e) => setGenderInput(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">
              Preview Audio URL (optional)
            </label>
            <input
              type="url"
              value={previewInput}
              onChange={(e) => setPreviewInput(e.target.value)}
              className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] font-mono focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Description</label>
            <textarea
              rows={2}
              value={descInput}
              onChange={(e) => setDescInput(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1.5">
              Plan Tier Availability (leave unchecked for All Plans)
            </label>
            <div className="flex flex-wrap gap-3 text-[#5A6580] dark:text-[#A2ADC7]">
              {plans.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowedPlans.includes(p.id)}
                    onChange={() => toggleAllowedPlan(p.id)}
                    className="accent-[#2E5BFF] dark:accent-[#4D74FF]"
                  />
                  <span>{p.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="h-9 px-4 rounded-xl border border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 px-5 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Voice</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
