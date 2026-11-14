import React, { useEffect, useState, useCallback } from 'react';
import { Search, Eye, Trash2 } from 'lucide-react';
import { adminApi } from '../api.js';
import { AdminProjectRecord, AdminSpeechRecord } from '../types.js';
import { useToast } from '../../context/ToastContext.js';
import { Modal } from '../../components/ui/index.js';

export const AdminProjectsView: React.FC<{ globalSearch?: string }> = ({ globalSearch = '' }) => {
  const { showToast } = useToast();
  const [projects, setProjects] = useState<AdminProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(globalSearch);
  const [statusFilter, setStatusFilter] = useState('all');

  const [inspectData, setInspectData] = useState<{
    project: AdminProjectRecord;
    generations: AdminSpeechRecord[];
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminProjectRecord | null>(null);

  useEffect(() => {
    setQ(globalSearch);
  }, [globalSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getProjects(q.trim(), statusFilter);
      setProjects(res.projects);
    } catch (err: any) {
      showToast(err.message || 'Failed to load projects.', 'error');
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleInspect = async (id: string) => {
    try {
      const res = await adminApi.getProjectDetail(id);
      setInspectData({ project: res.project, generations: res.generations });
    } catch (err: any) {
      showToast(err.message || 'Failed to inspect project.', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await adminApi.deleteProject(deleteTarget.id);
      showToast(`Deleted project "${deleteTarget.name}".`, 'info');
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete project.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#78839E] dark:text-[#7C87A3] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by project name, ID, or owner email..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E4E7EF] dark:border-[#1E2638] bg-[#F7F8FA] dark:bg-[#0D121D] text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">
                <th className="py-2.5 px-4 font-semibold">Project</th>
                <th className="py-2.5 px-4 font-semibold">Owner</th>
                <th className="py-2.5 px-4 font-semibold">Voice Actor</th>
                <th className="py-2.5 px-4 font-semibold text-right">Generations</th>
                <th className="py-2.5 px-4 font-semibold">Updated</th>
                <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EF] dark:divide-[#1E2638]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#5A6580] dark:text-[#A2ADC7]">
                    Loading projects...
                  </td>
                </tr>
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#5A6580] dark:text-[#A2ADC7]">
                    No user projects found.
                  </td>
                </tr>
              ) : (
                projects.map((p) => (
                  <tr key={p.id} className="hover:bg-[#F2F4F8]/70 dark:hover:bg-[#171E2E]/60 transition-colors duration-150">
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-[#11162B] dark:text-[#F3F5FA]">{p.name}</div>
                      <div className="text-[11px] font-mono text-[#78839E] dark:text-[#7C87A3]">{p.id}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="text-[#11162B] dark:text-[#F3F5FA]">{p.userName || p.userId}</div>
                      <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">{p.userEmail}</div>
                    </td>
                    <td className="py-2.5 px-4 text-[#5A6580] dark:text-[#A2ADC7]">{p.voiceName || '—'}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                      {p.generationsCount ?? 0}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleInspect(p.id)}
                          title="Inspect Project"
                          className="p-1.5 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(p)}
                          title="Delete Project"
                          className="p-1.5 rounded-lg hover:bg-[#DC2626]/12 text-[#DC2626] dark:text-[#F87171] cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]/40"
                        >
                          <Trash2 className="w-4 h-4" />
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

      <Modal
        isOpen={Boolean(inspectData)}
        onClose={() => setInspectData(null)}
        title={inspectData?.project.name || 'Project Details'}
        subtitle={inspectData ? `Owner: ${inspectData.project.userEmail || inspectData.project.userId}` : ''}
        maxWidthClass="max-w-2xl"
      >
        {inspectData && (
          <div className="space-y-4 text-xs">
            <div>
              <div className="font-display font-bold text-[#11162B] dark:text-[#F3F5FA] mb-1.5">
                Script / Narration Content
              </div>
              <div className="p-3.5 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed text-[#11162B] dark:text-[#F3F5FA]">
                {inspectData.project.script}
              </div>
            </div>
            <div>
              <div className="font-display font-bold text-[#11162B] dark:text-[#F3F5FA] mb-1.5">
                Linked Speech Generations ({inspectData.generations.length})
              </div>
              {inspectData.generations.length === 0 ? (
                <p className="text-[#5A6580] dark:text-[#A2ADC7]">No speech jobs linked to this project.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {inspectData.generations.map((g) => (
                    <div
                      key={g.id}
                      className="p-2.5 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] flex justify-between text-[#11162B] dark:text-[#F3F5FA]"
                    >
                      <span>{g.voiceName} ({g.charCount} chars)</span>
                      <span className="font-mono text-[#5A6580] dark:text-[#A2ADC7] capitalize">{g.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Project"
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[#5A6580] dark:text-[#A2ADC7]">
            Permanently delete project <strong className="text-[#11162B] dark:text-[#F3F5FA]">{deleteTarget?.name}</strong>? This action is recorded
            in the audit log.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="h-9 px-4 rounded-xl border border-[#E4E7EF] dark:border-[#1E2638] text-[#5A6580] dark:text-[#A2ADC7] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="h-9 px-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150"
            >
              Delete Project
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
