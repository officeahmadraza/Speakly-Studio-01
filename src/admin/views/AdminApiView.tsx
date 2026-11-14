import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  KeyRound,
  Activity,
  Power,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Star,
} from 'lucide-react';
import { adminApi } from '../api.js';
import { AdminIntegrationRecord } from '../types.js';
import { useToast } from '../../context/ToastContext.js';
import { Modal } from '../../components/ui/index.js';

export const AdminApiView: React.FC = () => {
  const { showToast } = useToast();
  const [integrations, setIntegrations] = useState<AdminIntegrationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminIntegrationRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminIntegrationRecord | null>(null);

  // Form
  const [providerName, setProviderName] = useState('');
  const [providerType, setProviderType] = useState<'openspeaker' | 'elevenlabs' | 'custom'>('openspeaker');
  const [endpointUrl, setEndpointUrl] = useState('https://api.ai33.pro');
  const [modelName, setModelName] = useState('eleven_multilingual_v2');
  const [apiKey, setApiKey] = useState('');
  const [rateLimitPerMin, setRateLimitPerMin] = useState('60');
  const [isPrimary, setIsPrimary] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getIntegrations();
      setIntegrations(res.integrations);
    } catch (err: any) {
      showToast(err.message || 'Failed to load API integrations.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setProviderName('');
    setProviderType('openspeaker');
    setEndpointUrl('https://api.ai33.pro');
    setModelName('eleven_multilingual_v2');
    setApiKey('');
    setRateLimitPerMin('60');
    setIsPrimary(integrations.length === 0);
    setIsEnabled(true);
    setModalOpen(true);
  };

  const openEdit = (rec: AdminIntegrationRecord) => {
    setEditing(rec);
    setProviderName(rec.providerName);
    setProviderType(rec.providerType);
    setEndpointUrl(rec.endpointUrl);
    setModelName(rec.modelName);
    setApiKey(''); // Never prefilled — only send if rotating
    setRateLimitPerMin(String(rec.rateLimitPerMin));
    setIsPrimary(rec.isPrimary);
    setIsEnabled(rec.isEnabled);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await adminApi.updateIntegration(editing.id, {
          providerName,
          endpointUrl,
          modelName,
          rateLimitPerMin: Number(rateLimitPerMin) || 60,
          isPrimary,
          isEnabled,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        });
        showToast('API integration updated cleanly.', 'success');
      } else {
        await adminApi.createIntegration({
          providerName,
          providerType,
          endpointUrl,
          modelName,
          apiKey: apiKey.trim(),
          rateLimitPerMin: Number(rateLimitPerMin) || 60,
          isPrimary,
          isEnabled,
        });
        showToast('New encrypted API credential stored.', 'success');
      }
      setModalOpen(false);
      await load();
    } catch (err: any) {
      showToast(err.message || 'Failed to save API integration.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await adminApi.testIntegration(id);
      if (res.success) {
        showToast('Provider health check succeeded.', 'success');
      } else {
        showToast(res.error || 'Provider returned degraded status.', 'warning');
      }
      await load();
    } catch (err: any) {
      showToast(err.message || 'Connection test failed.', 'error');
    } finally {
      setTestingId(null);
    }
  };

  const handleToggle = async (rec: AdminIntegrationRecord) => {
    try {
      await adminApi.updateIntegration(rec.id, { isEnabled: !rec.isEnabled });
      showToast(`${rec.providerName} ${rec.isEnabled ? 'disabled' : 'enabled'}.`, 'info');
      await load();
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle integration.', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await adminApi.deleteIntegration(deleteTarget.id);
      showToast('API integration deleted.', 'info');
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete integration.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7]">
          Keys are AES-256-GCM encrypted at rest on the server and strictly masked in responses. Never exposed to frontend TTS clients.
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="h-9 px-4 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 dark:focus-visible:ring-[#4D74FF]/40"
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span>Add Provider Credential</span>
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-xs text-[#5A6580] dark:text-[#A2ADC7]">Loading API integrations...</div>
      ) : (
        <div className="space-y-4">
          {integrations.map((rec) => (
            <div
              key={rec.id}
              className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-5 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-display text-sm font-bold text-[#11162B] dark:text-[#F3F5FA]">{rec.providerName}</h3>
                    {rec.isPrimary && (
                      <span className="inline-flex items-center gap-1 text-[#2E5BFF] dark:text-[#7A9AFF] text-[11px] font-semibold">
                        <Star className="w-3 h-3 fill-current" /> Primary
                      </span>
                    )}
                    <span className="text-[#78839E] dark:text-[#7C87A3]" aria-hidden="true">·</span>
                    <span
                      className={`text-[11px] font-semibold ${
                        rec.isEnabled
                          ? 'text-[#16A34A] dark:text-[#22C55E]'
                          : 'text-[#5A6580] dark:text-[#A2ADC7]'
                      }`}
                    >
                      {rec.isEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="text-xs font-mono tabular-nums text-[#5A6580] dark:text-[#A2ADC7]">
                    Endpoint: {rec.endpointUrl} · Model: {rec.modelName} · Limit: {rec.rateLimitPerMin}/min
                  </div>
                  <div className="text-xs font-mono text-[#11162B] dark:text-[#F3F5FA] flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-[#2E5BFF] dark:text-[#7A9AFF] shrink-0" />
                    <span>Stored Key: {rec.maskedKey}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={testingId === rec.id}
                    onClick={() => handleTest(rec.id)}
                    className="h-9 px-3 rounded-xl bg-[#EEF2FF] hover:bg-[#E0E7FF] dark:bg-[#4D74FF]/14 dark:hover:bg-[#4D74FF]/22 text-[#2E5BFF] dark:text-[#7A9AFF] text-xs font-semibold flex items-center gap-1.5 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {testingId === rec.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Activity className="w-3.5 h-3.5" />
                    )}
                    <span>Test Connection</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(rec)}
                    className="h-9 px-3 rounded-xl border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] text-xs font-semibold transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Edit / Rotate Key
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggle(rec)}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] transition-colors duration-150 cursor-pointer"
                    title={rec.isEnabled ? 'Disable' : 'Enable'}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(rec)}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-[#E4E7EF] dark:border-[#1E2638] text-[#DC2626] dark:text-[#F87171] hover:bg-[#DC2626]/10 transition-colors duration-150 cursor-pointer"
                    title="Delete Integration"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[#E4E7EF] dark:border-[#1E2638] text-xs">
                <div>
                  <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">Status</div>
                  <div className="font-semibold flex items-center gap-1 mt-0.5 text-[#11162B] dark:text-[#F3F5FA]">
                    {rec.lastStatus === 'connected' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] dark:text-[#22C55E]" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-[#D97706] dark:text-[#F59E0B]" />
                    )}
                    <span className="capitalize">{rec.lastStatus}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">API Requests</div>
                  <div className="font-mono tabular-nums font-bold mt-0.5 text-[#11162B] dark:text-[#F3F5FA]">{rec.usageCount.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">Estimated Cost</div>
                  <div className="font-mono tabular-nums font-bold mt-0.5 text-[#11162B] dark:text-[#F3F5FA]">${rec.totalEstimatedCostUsd.toFixed(4)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">Last Check</div>
                  <div className="font-mono tabular-nums text-[11px] mt-0.5 truncate text-[#11162B] dark:text-[#F3F5FA]">
                    {rec.lastTestedAt ? new Date(rec.lastTestedAt).toLocaleString() : 'Never'}
                  </div>
                </div>
              </div>

              {rec.recentErrors.length > 0 && (
                <div className="p-3 rounded-xl bg-[#DC2626]/8 dark:bg-[#F87171]/10 space-y-1.5">
                  <div className="text-[11px] font-bold text-[#DC2626] dark:text-[#F87171]">
                    Recent Provider Error Logs ({rec.recentErrors.length})
                  </div>
                  <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] font-mono">
                    {rec.recentErrors.slice(0, 5).map((e) => (
                      <div key={e.id} className="text-[#5A6580] dark:text-[#A2ADC7]">
                        [{e.statusCode}] {e.endpoint}: {e.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Integration Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Configure ${editing.providerName}` : 'Add AI Speech Provider'}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSave} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Provider Name *</label>
              <input
                type="text"
                required
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="OpenSpeaker Primary"
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Provider Type</label>
              <select
                value={providerType}
                disabled={Boolean(editing)}
                onChange={(e) => setProviderType(e.target.value as any)}
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] disabled:opacity-60"
              >
                <option value="openspeaker">OpenSpeaker</option>
                <option value="elevenlabs">ElevenLabs Direct</option>
                <option value="custom">Custom Compatible</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Endpoint URL *</label>
            <input
              type="url"
              required
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] font-mono focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Model Name</label>
              <input
                type="text"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] font-mono focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">Rate Limit / Min</label>
              <input
                type="number"
                min={1}
                value={rateLimitPerMin}
                onChange={(e) => setRateLimitPerMin(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] font-mono tabular-nums focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">
              {editing ? 'Rotate API Key (leave blank to keep current key)' : 'API Key *'}
            </label>
            <input
              type="password"
              required={!editing}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={editing ? '•••••••••••• (unchanged)' : 'sk_...'}
              className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] font-mono focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            />
          </div>

          <div className="flex items-center gap-6 text-[#5A6580] dark:text-[#A2ADC7]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
                className="accent-[#2E5BFF] dark:accent-[#4D74FF]"
              />
              <span>Enabled</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="accent-[#2E5BFF] dark:accent-[#4D74FF]"
              />
              <span>Set as Primary Active Provider</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
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
              <span>Save Credential</span>
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete API Integration"
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[#5A6580] dark:text-[#A2ADC7]">
            Delete <strong className="text-[#11162B] dark:text-[#F3F5FA]">{deleteTarget?.providerName}</strong> ({deleteTarget?.maskedKey})?
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
              onClick={handleDelete}
              className="h-9 px-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-semibold transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
