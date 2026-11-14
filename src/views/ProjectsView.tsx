import React, { useState, useMemo } from 'react';
import {
  FolderKanban,
  Plus,
  Trash2,
  Edit2,
  Mic,
  Calendar,
  ArrowRight,
  Search,
  FileAudio,
  Sliders,
  ChevronDown,
  ChevronUp,
  Check,
  X,
} from 'lucide-react';
import { Project, Voice, GenerationHistoryItem } from '../types/index.js';
import { Modal, Toggle, EmptyState } from '../components/ui/index.js';
import { AudioPlayer } from '../components/AudioPlayer.js';
import { getDownloadUrl } from '../services/api.js';
import { useToast } from '../context/ToastContext.js';

interface ProjectsViewProps {
  projects: Project[];
  voices: Voice[];
  history: GenerationHistoryItem[];
  onCreateOrUpdateProject: (project: Project, isNew: boolean) => void;
  onDeleteProject: (id: string) => void;
  onOpenProjectInStudio: (project: Project) => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  voices,
  history,
  onCreateOrUpdateProject,
  onDeleteProject,
  onOpenProjectInStudio,
}) => {
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [script, setScript] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [speed, setSpeed] = useState(1.0);
  const [withTranscript, setWithTranscript] = useState(false);
  const [fileName, setFileName] = useState('');

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.script.toLowerCase().includes(q) ||
        (p.voiceName && p.voiceName.toLowerCase().includes(q))
    );
  }, [projects, searchQuery]);

  const openCreateModal = () => {
    setEditingProject(null);
    setName('');
    setDescription('');
    setScript('');
    setVoiceId('');
    setSpeed(1.0);
    setWithTranscript(false);
    setFileName('');
    setIsModalOpen(true);
  };

  const openEditModal = (proj: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProject(proj);
    setName(proj.name);
    setDescription(proj.description);
    setScript(proj.script);
    setVoiceId(proj.voiceId || '');
    setSpeed(proj.speed ?? 1.0);
    setWithTranscript(Boolean(proj.withTranscript));
    setFileName(proj.fileName || '');
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Please enter a project name.', 'warning');
      return;
    }

    const matchedVoice = voices.find((v) => v.id === voiceId);
    const now = new Date().toISOString();

    const payload: Project = editingProject
      ? {
          ...editingProject,
          name: name.trim(),
          description: description.trim(),
          script,
          voiceId: voiceId || undefined,
          voiceName: matchedVoice?.name || (voiceId ? editingProject.voiceName : undefined),
          speed,
          withTranscript,
          fileName: fileName.trim() || undefined,
          updatedAt: now,
        }
      : {
          id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: name.trim(),
          description: description.trim(),
          script,
          voiceId: voiceId || undefined,
          voiceName: matchedVoice?.name,
          speed,
          withTranscript,
          fileName: fileName.trim() || undefined,
          createdAt: now,
          updatedAt: now,
        };

    onCreateOrUpdateProject(payload, !editingProject);
    setIsModalOpen(false);
  };

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[#11162B] dark:text-[#F3F5FA]">
            My Projects
          </h1>
          <p className="text-xs sm:text-sm text-[#5A6580] dark:text-[#A2ADC7] mt-0.5">
            Organize narration scripts, reusable voice settings, and linked audio outputs.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="h-9 px-4 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40"
        >
          <Plus className="w-4 h-4" />
          <span>New Project</span>
        </button>
      </div>

      {/* Search Bar */}
      {projects.length > 0 && (
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-[#78839E] dark:text-[#7C87A3] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects by title, script, or voice..."
            className="w-full h-10 pl-10 pr-4 rounded-xl bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] transition-colors"
          />
        </div>
      )}

      {/* Projects Grid */}
      {filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredProjects.map((proj) => {
            const linkedTracks = history.filter((item) => item.projectId === proj.id);
            const isExpanded = expandedProjectId === proj.id;
            const isConfirmingDelete = confirmDeleteId === proj.id;
            const wordCount = proj.script.trim() ? proj.script.trim().split(/\s+/).length : 0;

            return (
              <div
                key={proj.id}
                className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] hover:border-[#2E5BFF]/50 dark:hover:border-[#4D74FF]/50 rounded-2xl p-5 flex flex-col justify-between gap-4 transition-colors"
              >
                <div className="space-y-3">
                  {/* Card Top Bar */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] flex items-center justify-center shrink-0">
                      <FolderKanban className="w-5 h-5" />
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => openEditModal(proj, e)}
                        className="p-2 rounded-lg text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] transition-colors cursor-pointer"
                        title="Edit project"
                        aria-label={`Edit ${proj.name}`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1 bg-[#DC2626]/10 rounded-lg px-1.5 py-1">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteProject(proj.id);
                              setConfirmDeleteId(null);
                            }}
                            className="p-1 text-[#DC2626] dark:text-[#F87171] hover:bg-[#DC2626] hover:text-white rounded transition-colors cursor-pointer"
                            title="Confirm delete"
                            aria-label="Confirm delete project"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="p-1 text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] rounded transition-colors cursor-pointer"
                            title="Cancel delete"
                            aria-label="Cancel delete project"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(proj.id)}
                          className="p-2 rounded-lg text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#DC2626] dark:hover:text-[#F87171] hover:bg-[#DC2626]/10 transition-colors cursor-pointer"
                          title="Delete project"
                          aria-label={`Delete ${proj.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className="font-display text-base font-bold text-[#11162B] dark:text-[#F3F5FA] leading-snug">
                      {proj.name}
                    </h3>
                    <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] mt-1 line-clamp-2 leading-relaxed">
                      {proj.description || 'No project notes added.'}
                    </p>
                  </div>

                  {/* Script Snippet (borderless tonal quote block) */}
                  {proj.script ? (
                    <div className="p-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] text-xs text-[#5A6580] dark:text-[#A2ADC7] line-clamp-3 leading-relaxed">
                      &ldquo;{proj.script}&rdquo;
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] text-xs text-[#78839E] dark:text-[#7C87A3]">
                      Empty narration script
                    </div>
                  )}

                  {/* Metadata Summary */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#5A6580] dark:text-[#A2ADC7]">
                    <span className="inline-flex items-center gap-1 font-medium text-[#11162B] dark:text-[#F3F5FA]">
                      <Mic className="w-3 h-3 text-[#2E5BFF] dark:text-[#7A9AFF]" />
                      {proj.voiceName || 'Any Voice'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{(proj.speed ?? 1.0).toFixed(2)}x</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{wordCount} words</span>
                    {proj.withTranscript && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#2E5BFF] dark:text-[#7A9AFF] font-medium">Transcript</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Linked Generated Tracks */}
                {linkedTracks.length > 0 && (
                  <div className="pt-2.5 border-t border-[#E4E7EF] dark:border-[#1E2638] space-y-2">
                    <button
                      type="button"
                      onClick={() => setExpandedProjectId(isExpanded ? null : proj.id)}
                      className="w-full flex items-center justify-between text-xs font-semibold text-[#2E5BFF] dark:text-[#7A9AFF] hover:underline cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <FileAudio className="w-3.5 h-3.5" />
                        <span className="tabular-nums">
                          {linkedTracks.length} Linked Audio{' '}
                          {linkedTracks.length === 1 ? 'Take' : 'Takes'}
                        </span>
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="space-y-2.5 pt-1">
                        {linkedTracks.slice(0, 3).map((track) =>
                          track.audioUrl ? (
                            <AudioPlayer
                              key={track.id}
                              audioUrl={track.audioUrl}
                              title={track.fileName || track.voiceName}
                              voiceName={track.voiceName}
                              createdAt={track.createdAt}
                              downloadUrl={getDownloadUrl(
                                track.taskId,
                                track.fileName || 'Voice',
                                track.audioUrl
                              )}
                              downloadFileName={track.fileName || 'Voice'}
                            />
                          ) : null
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Card Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-[#E4E7EF] dark:border-[#1E2638]">
                  <span className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-[#78839E] dark:text-[#7C87A3]">
                    <Calendar className="w-3 h-3" />
                    <span>Updated {new Date(proj.updatedAt).toLocaleDateString()}</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => onOpenProjectInStudio(proj)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] hover:bg-[#2E5BFF] hover:text-white dark:hover:bg-[#4D74FF] dark:hover:text-white text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                  >
                    <span>Open in Studio</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<FolderKanban className="w-6 h-6" />}
          title={projects.length === 0 ? 'No Projects Yet' : 'No Matching Projects'}
          description={
            projects.length === 0
              ? 'Save narration scripts, preferred voice actors, and speech parameters into reusable studio projects.'
              : `No saved projects match "${searchQuery}". Try another keyword.`
          }
          action={
            projects.length === 0 ? (
              <button
                type="button"
                onClick={openCreateModal}
                className="px-4 py-2.5 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Project</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 rounded-xl bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Clear Search
              </button>
            )
          }
        />
      )}

      {/* Create / Edit Project Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProject ? 'Edit Project' : 'Create New Project'}
        subtitle="Configure reusable script content, voice actor assignment, and speech parameters."
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">
                Project Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q4 Product Launch"
                className="w-full px-3.5 py-2.5 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:bg-white dark:focus:bg-[#101521] focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">
                Output File Name (optional)
              </label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="e.g. launch_keynote_v1"
                className="w-full px-3.5 py-2.5 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:bg-white dark:focus:bg-[#101521] focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of this narration project..."
              className="w-full px-3.5 py-2.5 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:bg-white dark:focus:bg-[#101521] focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div>
              <label className="block text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">
                Default Voice Actor
              </label>
              <select
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl text-xs text-[#11162B] dark:text-[#F3F5FA] focus:outline-none focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
              >
                <option value="">Select later in Studio</option>
                {voices.slice(0, 150).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} {v.language ? `(${v.language})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-[#11162B] dark:text-[#F3F5FA] flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5 text-[#2E5BFF] dark:text-[#7A9AFF]" />
                  <span>Pacing / Speed</span>
                </span>
                <span className="font-mono tabular-nums font-bold text-[#2E5BFF] dark:text-[#7A9AFF]">
                  {speed.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.05"
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="studio-slider w-full h-1.5 bg-[#E4E7EF] dark:bg-[#1E2638] rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono tabular-nums text-[#78839E] dark:text-[#7C87A3] mt-1">
                <span>0.5x</span>
                <span>1.0x</span>
                <span>1.5x</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D]">
            <Toggle
              id="project-transcript-toggle"
              checked={withTranscript}
              onChange={setWithTranscript}
              label="Word-Aligned Transcript"
              description="Enable word-level timestamp metadata by default for this project."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">
              Narration Script
            </label>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={6}
              placeholder="Paste or draft the narration script..."
              className="w-full p-3.5 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:bg-white dark:focus:bg-[#101521] focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] resize-y leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E4E7EF] dark:border-[#1E2638]">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              {editingProject ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
