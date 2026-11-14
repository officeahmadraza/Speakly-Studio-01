import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Mic,
  Play,
  Pause,
  RotateCcw,
  Sliders,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Copy,
  Trash2,
  ChevronRight,
  Heart,
  Check,
  Undo2,
  Redo2,
  FolderPlus,
  AudioWaveform,
  Download,
} from 'lucide-react';
import {
  Voice,
  ServerAppConfig,
  GenerationHistoryItem,
  ActiveGenerationTask,
  Project,
} from '../types/index.js';
import { createTTSSpeech, fetchTaskStatus, getDownloadUrl, getTranscriptDownloadUrl } from '../services/api.js';
import {
  calculateCreditBreakdown,
  calculateMaxAllowedChars,
  DEFAULT_CREDIT_COST_PER_1K_CHARS,
  DEFAULT_TRANSCRIPT_SURCHARGE_PERCENT,
  formatTranscriptAsTxt,
  getTrimmedCharCount,
} from '../../shared/creditPricing.js';
import {
  getActiveTask,
  saveActiveTask,
  clearActiveTask,
  saveGenerationItem,
  addRecentVoiceId,
} from '../services/storage.js';
import { useAudioActions, useAudioPlaybackStatus } from '../context/AudioPlayerContext.js';
import { useToast } from '../context/ToastContext.js';
import { AudioPlayer } from '../components/AudioPlayer.js';
import { getVoiceInitials, getVoiceAvatarGradient } from '../components/VoiceCard.js';
import { Toggle, Modal } from '../components/ui/index.js';
import { GoogleLogoSvg } from '../components/GoogleSignInModal.js';
import { GuestWelcomeBanner } from '../components/GuestWelcomeBanner.js';

interface CreateSpeechViewProps {
  voices: Voice[];
  totalVoiceCount?: number;
  selectedVoice: Voice | null;
  onClearVoice?: () => void;
  onOpenVoiceSelector: () => void;
  config: ServerAppConfig;
  initialScript?: string;
  initialScriptKey?: number;
  activeProject?: Project | null;
  defaultSpeed?: number;
  defaultWithTranscript?: boolean;
  remainingCredits: number;
  onGenerationComplete: (item: GenerationHistoryItem) => void;
  onDeleteGeneratedItem?: (id: string) => void;
  onSaveToProject: (payload: {
    name: string;
    description: string;
    script: string;
    voiceId?: string;
    voiceName?: string;
    speed: number;
    withTranscript: boolean;
    fileName?: string;
  }) => void;
  favoriteIds?: string[];
  onToggleFavorite?: (voiceId: string) => void;
  isSignedIn?: boolean;
  isSigningIn?: boolean;
  onOpenSignIn?: () => void;
  onDirectGoogleSignIn?: () => Promise<void> | void;
  welcomeOfferDismissed?: boolean;
  onDismissWelcomeOffer?: () => void;
  welcomeBonusCredits?: number;
  signupBonusEnabled?: boolean;
  creditCostPer1kChars?: number;
  transcriptSurchargePercent?: number;
}

type GenerationStage =
  | 'idle'
  | 'validating'
  | 'generating'
  | 'processing'
  | 'completed'
  | 'failed';

function formatEstimatedDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0:00 min';
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')} min`;
}

export const CreateSpeechView: React.FC<CreateSpeechViewProps> = ({
  voices,
  totalVoiceCount,
  selectedVoice,
  onClearVoice,
  onOpenVoiceSelector,
  config,
  initialScript,
  initialScriptKey,
  activeProject,
  defaultSpeed = 1.0,
  defaultWithTranscript = false,
  remainingCredits,
  onGenerationComplete,
  onDeleteGeneratedItem,
  onSaveToProject,
  favoriteIds = [],
  onToggleFavorite,
  isSignedIn = false,
  isSigningIn = false,
  onOpenSignIn,
  onDirectGoogleSignIn,
  welcomeOfferDismissed = false,
  onDismissWelcomeOffer,
  welcomeBonusCredits = 5000,
  signupBonusEnabled = true,
  creditCostPer1kChars = DEFAULT_CREDIT_COST_PER_1K_CHARS,
  transcriptSurchargePercent = DEFAULT_TRANSCRIPT_SURCHARGE_PERCENT,
}) => {
  const { playVoicePreview, pause } = useAudioActions();
  const { activeVoiceId, isPlaying: audioPlaying, isLoading: audioLoading } = useAudioPlaybackStatus();
  const isVoicePlaying = useCallback(
    (voiceId: string) => Boolean(activeVoiceId === voiceId && audioPlaying),
    [activeVoiceId, audioPlaying]
  );
  const isVoiceLoading = useCallback(
    (voiceId: string) => Boolean(activeVoiceId === voiceId && audioLoading),
    [activeVoiceId, audioLoading]
  );
  const { showToast } = useToast();
  const [copiedVoiceId, setCopiedVoiceId] = useState(false);

  // Script + Undo/Redo stack
  const [text, setText] = useState<string>(initialScript || '');
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  const [speed, setSpeed] = useState<number>(defaultSpeed);
  // Word-Aligned Transcript always starts OFF for every new session; active projects preserve their own setting
  const [withTranscript, setWithTranscript] = useState<boolean>(() =>
    activeProject ? Boolean(activeProject.withTranscript) : false
  );
  const [fileName, setFileName] = useState<string>('');

  // Save Project modal state
  const [isSaveProjectOpen, setIsSaveProjectOpen] = useState(false);
  const [projectNameInput, setProjectNameInput] = useState('');
  const [projectDescInput, setProjectDescInput] = useState('');

  // Task execution state
  const [stage, setStage] = useState<GenerationStage>('idle');
  const [stageMessage, setStageMessage] = useState<string>('Ready to Generate');
  const [realProgress, setRealProgress] = useState<number | undefined>(undefined);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [completedItem, setCompletedItem] = useState<GenerationHistoryItem | null>(null);

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPollingRef = useRef<boolean>(false);
  const lastLimitToastRef = useRef<number>(0);

  // Sync incoming script / project config when user opens a project or history item
  useEffect(() => {
    if (initialScript !== undefined) {
      setText(initialScript);
      setUndoStack([]);
      setRedoStack([]);
      if (!activeProject) {
        setWithTranscript(false);
      }
    }
  }, [initialScript, initialScriptKey, activeProject]);

  useEffect(() => {
    if (activeProject) {
      setProjectNameInput(activeProject.name);
      setProjectDescInput(activeProject.description);
      if (activeProject.speed) setSpeed(activeProject.speed);
      setWithTranscript(Boolean(activeProject.withTranscript));
      if (activeProject.fileName) setFileName(activeProject.fileName);
    }
  }, [activeProject]);

  // Counters, dynamic 1:1 credit character limit & real-time credit breakdown (trimmed characters consistently)
  const trimmedText = text.trim();
  const charCount = getTrimmedCharCount(text);
  const wordCount = trimmedText ? trimmedText.split(/\s+/).length : 0;
  const maxChars = calculateMaxAllowedChars(remainingCredits, isSignedIn);
  const isOverLimit = charCount > maxChars;
  const charUsagePercent =
    maxChars > 0 ? Math.min(100, Math.round((charCount / maxChars) * 100)) : charCount > 0 ? 100 : 0;
  const isNearLimit = maxChars > 0 && !isOverLimit && charUsagePercent >= 80;
  const estimatedSeconds = wordCount > 0 ? Math.max(1, Math.round((wordCount / 145) * 60 / speed)) : 0;

  const effectiveRatePer1k = creditCostPer1kChars ?? config.creditCostPer1kChars ?? DEFAULT_CREDIT_COST_PER_1K_CHARS;
  const effectiveTranscriptPct =
    transcriptSurchargePercent ?? config.transcriptSurchargePercent ?? DEFAULT_TRANSCRIPT_SURCHARGE_PERCENT;

  const creditEstimate = useMemo(
    () =>
      calculateCreditBreakdown({
        charCount,
        withTranscript,
        availableCredits: remainingCredits,
        creditCostPer1kChars: effectiveRatePer1k,
        transcriptSurchargePercent: effectiveTranscriptPct,
      }),
    [charCount, withTranscript, remainingCredits, effectiveRatePer1k, effectiveTranscriptPct, selectedVoice?.id, speed]
  );

  const notifyLimitReached = useCallback(
    (reason?: string) => {
      const now = Date.now();
      if (now - lastLimitToastRef.current < 1800) return;
      lastLimitToastRef.current = now;
      showToast(
        reason ||
          (isSignedIn
            ? maxChars <= 0
              ? 'You have 0 credits available (1 credit = 1 character limit).'
              : `Maximum ${maxChars.toLocaleString()} characters allowed based on your available credits (1 credit = 1 char).`
            : `Guest preview is limited to ${maxChars.toLocaleString()} characters. Sign in with Google to use your credit balance.`),
        'warning',
        'Character Limit Reached'
      );
    },
    [isSignedIn, maxChars, showToast]
  );

  // Update script with undo/redo tracking & enforce dynamic trimmed character limit
  const updateScriptText = useCallback(
    (nextValue: string, allowUnbounded = false) => {
      let resolved = nextValue;
      const currentTrimmedLen = getTrimmedCharCount(text);
      const nextTrimmedLen = getTrimmedCharCount(resolved);

      if (!allowUnbounded && nextTrimmedLen > maxChars) {
        // Allow user to shorten text if it already exceeded a newly lowered limit
        if (nextTrimmedLen < currentTrimmedLen) {
          resolved = nextValue;
        } else if (currentTrimmedLen >= maxChars) {
          notifyLimitReached();
          return;
        } else {
          let lo = 0;
          let hi = resolved.length;
          while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            if (getTrimmedCharCount(resolved.slice(0, mid)) <= maxChars) {
              lo = mid;
            } else {
              hi = mid - 1;
            }
          }
          resolved = resolved.slice(0, lo);
          notifyLimitReached(
            `Text trimmed to ${maxChars.toLocaleString()} characters to match your credit-based limit (1 credit = 1 char).`
          );
        }
      }
      if (resolved === text) return;
      setUndoStack((prev) => [...prev.slice(-39), text]);
      setRedoStack([]);
      setText(resolved);
    },
    [text, maxChars, notifyLimitReached]
  );

  const handleScriptPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const pasted = e.clipboardData.getData('text');
      if (!pasted) return;
      const el = e.currentTarget;
      const start = el.selectionStart ?? text.length;
      const end = el.selectionEnd ?? text.length;
      const candidate = `${text.slice(0, start)}${pasted}${text.slice(end)}`;

      if (getTrimmedCharCount(candidate) <= maxChars) {
        return; // Allow native paste seamlessly
      }

      e.preventDefault();
      if (getTrimmedCharCount(text) >= maxChars && start === end) {
        notifyLimitReached();
        return;
      }

      let lo = 0;
      let hi = pasted.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const testVal = `${text.slice(0, start)}${pasted.slice(0, mid)}${text.slice(end)}`;
        if (getTrimmedCharCount(testVal) <= maxChars) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }

      if (lo <= 0) {
        notifyLimitReached();
        return;
      }

      const clipped = pasted.slice(0, lo);
      const nextVal = `${text.slice(0, start)}${clipped}${text.slice(end)}`;
      updateScriptText(nextVal, true);
      notifyLimitReached(
        `Pasted text clipped to fit your ${maxChars.toLocaleString()}-character credit limit (1 credit = 1 char).`
      );
      requestAnimationFrame(() => {
        el.focus();
        const cursor = start + clipped.length;
        el.setSelectionRange(cursor, cursor);
      });
    },
    [text, maxChars, notifyLimitReached, updateScriptText]
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, text]);
    setText(previous);
  }, [undoStack, text]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, text]);
    setText(next);
  }, [redoStack, text]);

  useEffect(() => {
    return () => {
      if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
    };
  }, []);

  // Poll Task Status
  const pollTask = useCallback(
    async (taskId: string, currentTaskMeta: ActiveGenerationTask, attempt = 1, delay = 2500) => {
      if (isPollingRef.current) return;
      isPollingRef.current = true;

      try {
        const taskData = await fetchTaskStatus(taskId);

        if (taskData.status === 'done' || taskData.status === 'completed') {
          setStage('completed');
          setStageMessage('Generation Completed');
          setRealProgress(undefined);
          clearActiveTask();
          isPollingRef.current = false;

          const words = currentTaskMeta.text.trim().split(/\s+/).filter(Boolean).length;
          const estSec = Math.max(1, Math.round((words / 145) * 60 / currentTaskMeta.speed));
          const hasGeneratedTranscript = Boolean(
            currentTaskMeta.withTranscript &&
              taskData.transcriptData &&
              Array.isArray(taskData.transcriptData.words) &&
              taskData.transcriptData.words.length > 0
          );

          const historyItem: GenerationHistoryItem = {
            id: `gen_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            taskId,
            voiceId: currentTaskMeta.voiceId,
            voiceName: currentTaskMeta.voiceName,
            projectId: currentTaskMeta.projectId,
            text: currentTaskMeta.text,
            charCount: getTrimmedCharCount(currentTaskMeta.text),
            wordCount: words,
            speed: currentTaskMeta.speed,
            withTranscript: currentTaskMeta.withTranscript,
            hasTranscript: hasGeneratedTranscript,
            transcriptData: hasGeneratedTranscript ? taskData.transcriptData : undefined,
            fileName: currentTaskMeta.fileName || undefined,
            audioUrl: taskData.audioUrl || null,
            creditCost: taskData.creditCost,
            audioCredits: taskData.audioCredits,
            transcriptCredits: hasGeneratedTranscript ? taskData.transcriptCredits : 0,
            estimatedDurationSec: estSec,
            status: 'completed',
            createdAt: new Date().toISOString(),
          };

          setCompletedItem(historyItem);
          saveGenerationItem(historyItem);
          onGenerationComplete(historyItem);
          showToast(
            hasGeneratedTranscript
              ? 'Speech audio and word-aligned transcript ready for download!'
              : 'Speech audio ready for playback & download!',
            'success',
            'Generation Completed'
          );
          return;
        }

        if (taskData.status === 'failed' || taskData.status === 'error') {
          setStage('failed');
          const errorMsg = taskData.errorMessage || 'Voice generation failed upstream.';
          setTaskError(errorMsg);
          setRealProgress(undefined);
          clearActiveTask();
          isPollingRef.current = false;
          showToast(errorMsg, 'error', 'Generation Failed');
          return;
        }

        const hasRealProgress = typeof taskData.progress === 'number' && taskData.progress > 0;
        setRealProgress(hasRealProgress ? taskData.progress : undefined);
        setStage(hasRealProgress && taskData.progress! > 40 ? 'processing' : 'generating');
        setStageMessage(
          hasRealProgress
            ? `Processing Audio (${taskData.progress}%)...`
            : 'Generating Speech upstream...'
        );

        isPollingRef.current = false;
        const jitter = Math.floor(Math.random() * 500);
        pollingTimeoutRef.current = setTimeout(() => {
          pollTask(taskId, currentTaskMeta, attempt + 1, 2500 + jitter);
        }, delay + jitter);
      } catch (err: any) {
        isPollingRef.current = false;
        const retryDelay = err.retryAfter ? err.retryAfter * 1000 : Math.min(delay * 1.5, 10000);
        const jitter = Math.floor(Math.random() * 400);

        if (attempt > 40) {
          setStage('failed');
          setTaskError('Task status polling timed out after multiple attempts.');
          clearActiveTask();
          return;
        }

        pollingTimeoutRef.current = setTimeout(() => {
          pollTask(taskId, currentTaskMeta, attempt + 1, retryDelay + jitter);
        }, retryDelay + jitter);
      }
    },
    [onGenerationComplete, showToast]
  );

  // Resume active task on reload
  useEffect(() => {
    const saved = getActiveTask();
    if (saved && saved.taskId && stage === 'idle') {
      setActiveTaskId(saved.taskId);
      setStage('processing');
      setStageMessage('Resuming active speech generation...');
      setText(saved.text);
      setSpeed(saved.speed);
      setWithTranscript(saved.withTranscript);
      setFileName(saved.fileName || '');
      pollTask(saved.taskId, saved);
    }
  }, [pollTask, stage]);

  const isGenerating = stage === 'validating' || stage === 'generating' || stage === 'processing';

  const generateDefaultFileName = (voiceName: string) => {
    const safeVoice = voiceName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const stamp = new Date().toISOString().slice(11, 16).replace(':', '');
    return `${safeVoice}_${stamp}`;
  };

  // Start Generation
  const handleGenerate = useCallback(async () => {
    if (isGenerating) return;

    if (!isSignedIn) {
      showToast(
        signupBonusEnabled && welcomeBonusCredits > 0
          ? `Sign in with Google to receive ${welcomeBonusCredits.toLocaleString()} free welcome credits and generate speech.`
          : 'Please sign in with Google to generate speech.',
        'warning',
        'Google Sign-In Required'
      );
      if (onOpenSignIn) onOpenSignIn();
      return;
    }

    if (!selectedVoice) {
      showToast('Please select a voice actor first.', 'warning');
      onOpenVoiceSelector();
      return;
    }

    if (!text.trim()) {
      showToast('Please enter a narration script to generate speech.', 'warning');
      editorRef.current?.focus();
      return;
    }

    if (isOverLimit) {
      showToast(
        `Script exceeds your available credit-based limit of ${maxChars.toLocaleString()} characters (1 credit = 1 character).`,
        'error'
      );
      return;
    }

    if (remainingCredits <= 0 || !creditEstimate.hasEnoughCredits) {
      const shortfallMsg =
        creditEstimate.shortfallCredits > 0
          ? `Insufficient credits: need ${creditEstimate.shortfallCredits.toLocaleString()} more credits to generate this speech.`
          : 'Insufficient credits remaining. Open Plans to refill or upgrade.';
      showToast(shortfallMsg, 'error', 'Insufficient Credits');
      return;
    }

    const resolvedFileName = fileName.trim() || generateDefaultFileName(selectedVoice.name);

    // Demo fallback if server has no API key
    if (!config.isConfigured) {
      setStage('validating');
      setStageMessage('Demo Simulation Mode (Browser Speech Synthesis)...');
      setTaskError(null);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text.trim());
        utterance.rate = speed;
        utterance.onend = () => {
          setStage('idle');
          setStageMessage('Ready to Generate');
        };
        window.speechSynthesis.speak(utterance);
        showToast(
          'Playing simulated browser speech preview (OpenSpeaker API key not configured on server).',
          'info',
          'Demo Simulation'
        );
      } else {
        setStage('failed');
        setTaskError('OpenSpeaker API key is not configured on the server.');
      }
      return;
    }

    setStage('validating');
    setStageMessage('Validating Input...');
    setRealProgress(undefined);
    setTaskError(null);
    setCompletedItem(null);

    try {
      const response = await createTTSSpeech({
        text: text.trim(),
        voiceId: selectedVoice.id,
        voiceName: selectedVoice.name,
        projectId: activeProject?.id,
        speed: speed !== 1.0 ? speed : undefined,
        withTranscript,
        fileName: resolvedFileName,
      });

      const currentTaskMeta: ActiveGenerationTask = {
        taskId: response.taskId,
        voiceId: selectedVoice.id,
        voiceName: selectedVoice.name,
        projectId: activeProject?.id,
        text: text.trim(),
        speed,
        withTranscript,
        fileName: resolvedFileName,
        startedAt: Date.now(),
      };

      setActiveTaskId(response.taskId);
      saveActiveTask(currentTaskMeta);
      addRecentVoiceId(selectedVoice.id);

      setStage('generating');
      setStageMessage('Generating Speech...');
      pollTask(response.taskId, currentTaskMeta);
    } catch (err: any) {
      setStage('failed');
      const msg = err.message || 'Failed to start text-to-speech task.';
      if (err.code === 'GOOGLE_AUTH_REQUIRED' || err.code === 'USER_SYNC_REQUIRED' || err.statusCode === 401) {
        if (onOpenSignIn) onOpenSignIn();
      }
      setTaskError(msg);
      showToast(msg, 'error', 'Generation Failed');
    }
  }, [
    isGenerating,
    isSignedIn,
    signupBonusEnabled,
    welcomeBonusCredits,
    onOpenSignIn,
    selectedVoice,
    text,
    isOverLimit,
    maxChars,
    remainingCredits,
    creditEstimate.hasEnoughCredits,
    creditEstimate.shortfallCredits,
    config.isConfigured,
    fileName,
    speed,
    withTranscript,
    activeProject?.id,
    showToast,
    onOpenVoiceSelector,
    pollTask,
  ]);

  // Keyboard shortcuts: Ctrl/Cmd + Enter to Generate, Ctrl/Cmd + Z/Shift+Z for Undo/Redo
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleGenerate();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      if (e.shiftKey && redoStack.length > 0) {
        e.preventDefault();
        handleRedo();
      } else if (!e.shiftKey && undoStack.length > 0) {
        e.preventDefault();
        handleUndo();
      }
    }
  };

  const handleSelectAll = (e: React.MouseEvent) => {
    e.preventDefault();
    editorRef.current?.focus();
    editorRef.current?.select();
  };

  const handleVoicePreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedVoice || !selectedVoice.previewUrl) return;
    if (isVoicePlaying(selectedVoice.id)) {
      pause();
    } else {
      playVoicePreview(selectedVoice);
    }
  };

  const handleCopyVoiceId = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedVoice?.id) return;
    navigator.clipboard.writeText(selectedVoice.id);
    setCopiedVoiceId(true);
    showToast('Voice ID copied to clipboard', 'info');
    setTimeout(() => setCopiedVoiceId(false), 2000);
  };

  const handleDownloadTranscript = useCallback(
    async (item: GenerationHistoryItem) => {
      if (!item.withTranscript || !item.hasTranscript || !item.transcriptData?.words?.length) {
        return;
      }
      const rawDisplayName = (item.fileName || item.voiceName || `speech_${item.taskId}`).trim();
      const safeSlug = rawDisplayName
        .replace(/[^a-zA-Z0-9_\-\s]/g, '_')
        .trim()
        .replace(/\s+/g, '_');
      const filename = `${safeSlug || 'speech'}_transcript.txt`;
      const txtContent = formatTranscriptAsTxt({
        transcript: item.transcriptData,
        fileName: rawDisplayName,
        totalCharacters: getTrimmedCharCount(item.text) || item.charCount,
      });

      try {
        const blob = new Blob([txtContent], {
          type: 'text/plain;charset=utf-8',
        });
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
        showToast(`Transcript downloaded (${filename})`, 'success');
      } catch {
        // Fallback to server transcript .txt endpoint
        const fallbackLink = document.createElement('a');
        fallbackLink.href = getTranscriptDownloadUrl(item.taskId);
        fallbackLink.download = filename;
        document.body.appendChild(fallbackLink);
        fallbackLink.click();
        document.body.removeChild(fallbackLink);
      }
    },
    [showToast]
  );

  const isVoiceFavorite = Boolean(selectedVoice && favoriteIds.includes(selectedVoice.id));
  const showGuestWelcomeOffer =
    !isSignedIn &&
    !welcomeOfferDismissed &&
    signupBonusEnabled !== false &&
    welcomeBonusCredits > 0;

  return (
    <div className="w-full max-w-[1440px] mx-auto px-3.5 sm:px-5 lg:px-7 py-4 sm:py-5 lg:py-6 space-y-4 sm:space-y-5 pb-8 sm:pb-10">
      {/* First-Time Guest Welcome Offer Banner */}
      {showGuestWelcomeOffer && (
        <GuestWelcomeBanner
          welcomeBonusCredits={welcomeBonusCredits}
          isSigningIn={isSigningIn}
          onClaimWithGoogle={onDirectGoogleSignIn || onOpenSignIn || (() => undefined)}
          onDismiss={onDismissWelcomeOffer || (() => undefined)}
        />
      )}

      {!config.isConfigured && (
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#D97706]/10 border border-[#D97706]/30 text-[#9A630E] dark:text-[#F59E0B] text-xs font-medium w-fit max-w-full">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            OpenSpeaker API key not detected on server — Generate Speech will run in Browser Demo Simulation mode.
          </span>
        </div>
      )}

      {/* Main Responsive Workspace Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-5 xl:gap-6 items-start">
        {/* Left Column: Script / Narration Canvas */}
        <div className="md:col-span-7 xl:col-span-8 min-w-0 flex flex-col gap-4 sm:gap-5">
          <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-3.5 sm:p-5 flex flex-col">
            {/* Editor Header Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E4E7EF] dark:border-[#1E2638] mb-3.5">
              <div className="inline-flex items-center gap-2 text-sm font-bold text-[#11162B] dark:text-[#F3F5FA]">
                <FileText className="w-4 h-4 text-[#2E5BFF] dark:text-[#7A9AFF]" />
                <span className="font-display tracking-tight">Script Canvas</span>
              </div>

              <div className="flex items-center flex-wrap gap-1 sm:gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={undoStack.length === 0 || isGenerating}
                  title="Undo (Ctrl/Cmd + Z)"
                  aria-label="Undo script edit"
                  className="p-1.5 rounded-lg text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] disabled:opacity-35 transition-colors cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={redoStack.length === 0 || isGenerating}
                  title="Redo (Ctrl/Cmd + Shift + Z)"
                  aria-label="Redo script edit"
                  className="p-1.5 rounded-lg text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] disabled:opacity-35 transition-colors cursor-pointer"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>

                <span className="h-4 w-px bg-[#E4E7EF] dark:bg-[#1E2638] mx-0.5" aria-hidden="true" />

                <button
                  type="button"
                  onClick={handleSelectAll}
                  disabled={!text}
                  className="hidden sm:inline-flex px-2 py-1.5 rounded-lg text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] hover:bg-[#F2F4F8] dark:hover:bg-[#171E2E] transition-colors disabled:opacity-40 font-medium whitespace-nowrap cursor-pointer"
                >
                  Select All
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (text) updateScriptText('');
                  }}
                  disabled={!text || isGenerating}
                  className="px-2 py-1.5 rounded-lg text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#DC2626] dark:hover:text-[#F87171] hover:bg-[#DC2626]/10 transition-colors disabled:opacity-40 flex items-center gap-1 font-medium whitespace-nowrap cursor-pointer"
                  title="Clear script"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">Clear</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!projectNameInput && activeProject) setProjectNameInput(activeProject.name);
                    setIsSaveProjectOpen(true);
                  }}
                  disabled={!text.trim()}
                  title="Save script & configuration to My Projects"
                  className="h-8 px-2.5 rounded-lg text-[#11162B] dark:text-[#F3F5FA] bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] hover:border-[#2E5BFF] dark:hover:border-[#4D74FF] transition-colors disabled:opacity-40 flex items-center gap-1.5 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-[#2E5BFF] dark:text-[#7A9AFF]" />
                  <span className="hidden sm:inline">Save Project</span>
                </button>
              </div>
            </div>

            {/* Multiline Text Editor */}
            <div className="relative flex-1 min-h-[240px] sm:min-h-[320px] md:min-h-[380px] lg:min-h-[430px] flex flex-col">
              <textarea
                ref={editorRef}
                id="tts-editor"
                value={text}
                onChange={(e) => updateScriptText(e.target.value)}
                onPaste={handleScriptPaste}
                onKeyDown={handleEditorKeyDown}
                disabled={isGenerating}
                aria-label="Narration script editor"
                placeholder={
                  isSignedIn && maxChars <= 0
                    ? 'You have 0 available credits. Top up or upgrade your plan to write and generate speech...'
                    : 'Start typing or paste your narration script here. Use natural punctuation to guide cadence...'
                }
                className={`w-full flex-1 p-3.5 sm:p-5 bg-[#F7F8FA] dark:bg-[#0D121D] border rounded-xl text-sm text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:bg-white dark:focus:bg-[#101521] focus:ring-2 resize-y leading-relaxed font-sans transition-colors ${
                  isOverLimit
                    ? 'border-[#DC2626] focus:ring-[#DC2626]/20'
                    : isNearLimit
                    ? 'border-[#D97706] focus:ring-[#D97706]/20'
                    : 'border-[#E4E7EF] dark:border-[#1E2638] focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] focus:ring-[#2E5BFF]/15'
                }`}
                rows={10}
              />
            </div>

            {/* Character Limit Progress Bar */}
            <div className="w-full bg-[#E4E7EF] dark:bg-[#1E2638] h-1 rounded-full mt-3.5 overflow-hidden">
              <div
                className={`h-full transition-all duration-150 ${
                  isOverLimit
                    ? 'bg-[#DC2626]'
                    : isNearLimit
                    ? 'bg-[#D97706]'
                    : 'bg-[#2E5BFF] dark:bg-[#4D74FF]'
                }`}
                style={{ width: `${charUsagePercent}%` }}
              />
            </div>

            {/* Live Editor Statistics & Dynamic 1:1 Credit Character Counter */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-xs">
              <div className="flex items-center flex-wrap gap-2 text-[#5A6580] dark:text-[#A2ADC7]">
                <span className="font-mono tabular-nums font-medium">{wordCount.toLocaleString()} words</span>
                <span aria-hidden="true">·</span>
                <span
                  className={`font-mono tabular-nums ${
                    isOverLimit
                      ? 'text-[#DC2626] dark:text-[#F87171] font-semibold'
                      : isNearLimit
                      ? 'text-[#D97706] dark:text-[#F59E0B] font-semibold'
                      : 'text-[#11162B] dark:text-[#F3F5FA] font-medium'
                  }`}
                  title={
                    isSignedIn
                      ? 'Dynamic limit: 1 available credit = 1 character'
                      : 'Guest preview limit (Sign in to unlock your credit-based character allowance)'
                  }
                >
                  {charCount.toLocaleString()} / {maxChars.toLocaleString()} chars
                </span>
                <span className="text-[11px] text-[#78839E] dark:text-[#7C87A3] font-mono">
                  ({isSignedIn ? '1 credit = 1 char' : 'guest preview'})
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-[#2E5BFF] dark:text-[#7A9AFF] font-medium">
                  ~{formatEstimatedDuration(estimatedSeconds)}
                </span>
                <span aria-hidden="true">·</span>
                <span
                  className="font-mono tabular-nums font-semibold text-[#11162B] dark:text-[#F3F5FA]"
                  title={
                    withTranscript
                      ? `Audio (1 credit/char) + Word-Aligned Transcript (+${creditEstimate.transcriptSurchargePercent}% rounded up)`
                      : '1 credit per trimmed character'
                  }
                >
                  ~{creditEstimate.totalCredits.toLocaleString()} credits
                </span>
              </div>

              {isOverLimit ? (
                <span className="text-[#DC2626] dark:text-[#F87171] text-xs font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Exceeds limit by {(charCount - maxChars).toLocaleString()} chars</span>
                </span>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-[#78839E] dark:text-[#7C87A3]">
                  Press <kbd className="px-1.5 py-0.5 rounded bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] font-mono text-[#5A6580] dark:text-[#A2ADC7]">⌘ Enter</kbd> to generate
                </span>
              )}
            </div>
          </div>

          {/* Generation Progress / Output Card (Directly below editor on desktop for clear sightlines) */}
          {stage !== 'idle' && (
            <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-5 animate-studio-enter">
              {isGenerating && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2">
                  <div className="flex items-center gap-4">
                    {/* Animated Audio Waveform */}
                    <div className="w-12 h-12 rounded-2xl bg-[#EEF2FF] dark:bg-[#4D74FF]/14 flex items-center justify-center gap-1 px-2 shrink-0">
                      <span className="w-1 h-5 rounded-full bg-[#2E5BFF] dark:bg-[#4D74FF] animate-waveform-bar" style={{ animationDelay: '0ms' }} />
                      <span className="w-1 h-7 rounded-full bg-[#7A9AFF] animate-waveform-bar" style={{ animationDelay: '150ms' }} />
                      <span className="w-1 h-4 rounded-full bg-[#2E5BFF] dark:bg-[#4D74FF] animate-waveform-bar" style={{ animationDelay: '300ms' }} />
                      <span className="w-1 h-6 rounded-full bg-[#7A9AFF] animate-waveform-bar" style={{ animationDelay: '450ms' }} />
                    </div>
                    <div>
                      <h4 className="font-display text-sm font-bold text-[#11162B] dark:text-[#F3F5FA]">{stageMessage}</h4>
                      <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] mt-0.5">
                        {activeTaskId ? (
                          <>
                            Task ID: <span className="font-mono font-medium">{activeTaskId}</span>
                          </>
                        ) : (
                          'Preparing request for synthesis provider...'
                        )}
                      </p>
                    </div>
                  </div>

                  {typeof realProgress === 'number' && (
                    <div className="w-full sm:w-44 space-y-1">
                      <div className="h-2 rounded-full bg-[#E4E7EF] dark:bg-[#1E2638] overflow-hidden">
                        <div
                          className="h-full bg-[#2E5BFF] dark:bg-[#4D74FF] transition-all"
                          style={{ width: `${Math.min(100, realProgress)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {stage === 'failed' && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#DC2626]/10 flex items-center justify-center text-[#DC2626] dark:text-[#F87171] shrink-0">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-display text-sm font-bold text-[#DC2626] dark:text-[#F87171]">Generation Failed</h4>
                      <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] mt-0.5">{taskError}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleGenerate}
                      className="h-9 px-3.5 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStage('idle')}
                      className="h-9 px-3.5 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] text-[#5A6580] dark:text-[#A2ADC7] text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {stage === 'completed' && completedItem && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#16A34A]/15 text-[#16A34A] dark:text-[#22C55E] flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-display text-sm font-bold text-[#11162B] dark:text-[#F3F5FA]">
                          Generation Completed
                        </h3>
                        <p className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] font-mono tabular-nums">
                          {completedItem.voiceName} · {completedItem.wordCount} words
                          {completedItem.creditCost !== null && completedItem.creditCost !== undefined
                            ? ` · ${completedItem.creditCost} credits`
                            : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setStage('idle');
                        setCompletedItem(null);
                      }}
                      className="text-xs font-semibold text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] cursor-pointer whitespace-nowrap"
                    >
                      Close Result
                    </button>
                  </div>

                  {completedItem.audioUrl ? (
                    <div className="space-y-3">
                      <AudioPlayer
                        audioUrl={completedItem.audioUrl}
                        title={completedItem.fileName || `${completedItem.voiceName} Narration`}
                        voiceName={completedItem.voiceName}
                        createdAt={completedItem.createdAt}
                        downloadUrl={getDownloadUrl(
                          completedItem.taskId,
                          completedItem.fileName || 'Voice',
                          completedItem.audioUrl
                        )}
                        downloadFileName={completedItem.fileName || 'Voice'}
                        onRegenerate={handleGenerate}
                        onDelete={() => {
                          if (onDeleteGeneratedItem) onDeleteGeneratedItem(completedItem.id);
                          setCompletedItem(null);
                          setStage('idle');
                        }}
                      />

                      {completedItem.withTranscript &&
                        completedItem.hasTranscript &&
                        completedItem.transcriptData &&
                        completedItem.transcriptData.words.length > 0 && (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D]">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] flex items-center justify-center shrink-0">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                                  Word-Aligned Transcript Ready
                                </div>
                                <div className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] font-mono tabular-nums truncate">
                                  {completedItem.transcriptData.wordCount.toLocaleString()} words
                                  {completedItem.transcriptData.durationSeconds !== undefined
                                    ? ` · ${completedItem.transcriptData.durationSeconds.toFixed(2)}s`
                                    : ''}
                                  {' · TXT'}
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDownloadTranscript(completedItem)}
                              className="h-9 px-3.5 rounded-xl bg-white dark:bg-[#101521] border border-[#CFD6E6] dark:border-[#2C364F] hover:border-[#2E5BFF] hover:text-[#2E5BFF] dark:hover:text-[#7A9AFF] text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download Transcript (.txt)</span>
                            </button>
                          </div>
                        )}
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-[#D97706]/10 border border-[#D97706]/30 text-xs text-[#9A630E] dark:text-[#F59E0B]">
                      Audio was synthesized upstream, but no streamable URL was returned. Check History for task details.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Voice Actor + Speech Parameters */}
        <div className="md:col-span-5 xl:col-span-4 min-w-0 flex flex-col gap-4 sm:gap-5 md:sticky md:top-5">
          {/* Voice Actor Panel */}
          <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-4 sm:p-5 flex flex-col gap-3.5 sm:gap-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-sm font-bold text-[#11162B] dark:text-[#F3F5FA] tracking-tight">
                Voice Actor
              </span>
              <button
                type="button"
                onClick={onOpenVoiceSelector}
                className="text-xs font-semibold text-[#2E5BFF] dark:text-[#7A9AFF] hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <span className="tabular-nums">
                  Browse All
                  {(totalVoiceCount || voices.length) > 0
                    ? ` (${(totalVoiceCount || voices.length).toLocaleString()})`
                    : ''}
                </span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {selectedVoice ? (
              <div className="space-y-3.5">
                <div className="p-3.5 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div
                        className={`w-11 h-11 rounded-xl bg-gradient-to-br ${getVoiceAvatarGradient(
                          selectedVoice.name
                        )} flex items-center justify-center font-display font-bold text-sm text-white shrink-0 ${
                          isVoicePlaying(selectedVoice.id)
                            ? 'ring-2 ring-[#2E5BFF] dark:ring-[#4D74FF] ring-offset-2 dark:ring-offset-[#0D121D]'
                            : ''
                        }`}
                      >
                        {isVoicePlaying(selectedVoice.id) ? (
                          <div className="flex items-end gap-[2.5px] h-4" aria-hidden="true">
                            <span className="w-[3px] rounded-full bg-white animate-waveform-bar" style={{ animationDelay: '0ms' }} />
                            <span className="w-[3px] rounded-full bg-white animate-waveform-bar" style={{ animationDelay: '150ms' }} />
                            <span className="w-[3px] rounded-full bg-white animate-waveform-bar" style={{ animationDelay: '300ms' }} />
                          </div>
                        ) : (
                          getVoiceInitials(selectedVoice.name)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display font-bold text-[#11162B] dark:text-[#F3F5FA] text-sm truncate">
                          {selectedVoice.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                          <span className="font-mono text-[11px] text-[#5A6580] dark:text-[#A2ADC7] truncate">
                            {selectedVoice.id}
                          </span>
                          <button
                            type="button"
                            onClick={handleCopyVoiceId}
                            className="p-0.5 text-[#78839E] dark:text-[#7C87A3] hover:text-[#11162B] dark:hover:text-[#F3F5FA] cursor-pointer"
                            aria-label="Copy Voice ID"
                          >
                            {copiedVoiceId ? (
                              <Check className="w-3.5 h-3.5 text-[#16A34A] dark:text-[#22C55E]" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {onToggleFavorite && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(selectedVoice.id);
                        }}
                        className={`p-2 rounded-xl transition-colors cursor-pointer ${
                          isVoiceFavorite
                            ? 'text-[#DC2626] dark:text-[#F87171] bg-[#DC2626]/10'
                            : 'text-[#78839E] dark:text-[#7C87A3] hover:text-[#11162B] dark:hover:text-[#F3F5FA]'
                        }`}
                        aria-label={isVoiceFavorite ? 'Remove from favorites' : 'Save as favorite'}
                      >
                        <Heart className={`w-4 h-4 ${isVoiceFavorite ? 'fill-[#DC2626] dark:fill-[#F87171]' : ''}`} />
                      </button>
                    )}
                  </div>

                  {/* Clean Metadata */}
                  <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-xs text-[#5A6580] dark:text-[#A2ADC7] capitalize pt-2 border-t border-[#E4E7EF] dark:border-[#1E2638]">
                    {[selectedVoice.language, selectedVoice.accent, selectedVoice.gender, selectedVoice.age, selectedVoice.category]
                      .filter(Boolean)
                      .map((meta, idx) => (
                        <React.Fragment key={`${meta}-${idx}`}>
                          {idx > 0 && <span aria-hidden="true">·</span>}
                          <span>{meta}</span>
                        </React.Fragment>
                      ))}
                  </div>

                  {selectedVoice.previewUrl && (
                    <button
                      type="button"
                      onClick={handleVoicePreview}
                      className={`w-full h-9 flex items-center justify-between px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                        isVoicePlaying(selectedVoice.id)
                          ? 'bg-[#2E5BFF] dark:bg-[#4D74FF] text-white'
                          : 'bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] text-[#11162B] dark:text-[#F3F5FA] hover:border-[#2E5BFF] dark:hover:border-[#4D74FF]'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {isVoiceLoading(selectedVoice.id) ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isVoicePlaying(selectedVoice.id) ? (
                          <Pause className="w-3.5 h-3.5 fill-current" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current text-[#2E5BFF] dark:text-[#7A9AFF]" />
                        )}
                        <span>
                          {isVoiceLoading(selectedVoice.id)
                            ? 'Loading Sample...'
                            : isVoicePlaying(selectedVoice.id)
                            ? 'Playing Preview'
                            : 'Preview Voice Sample'}
                        </span>
                      </span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onOpenVoiceSelector}
                    className="flex-1 h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] hover:bg-[#EEF2FF] dark:hover:bg-[#171E2E] text-[#11162B] dark:text-[#F3F5FA] font-semibold text-xs border border-[#E4E7EF] dark:border-[#1E2638] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5 text-[#5A6580] dark:text-[#A2ADC7]" />
                    <span>Change Voice</span>
                  </button>
                  {onClearVoice && (
                    <button
                      type="button"
                      onClick={onClearVoice}
                      className="h-9 px-3 rounded-xl text-xs font-medium text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#DC2626] dark:hover:text-[#F87171] hover:bg-[#DC2626]/10 transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Empty State */
              <div className="p-6 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] text-center flex flex-col items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] flex items-center justify-center">
                  <Mic className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-display text-sm font-bold text-[#11162B] dark:text-[#F3F5FA]">No Voice Selected</p>
                  <p className="text-xs text-[#5A6580] dark:text-[#A2ADC7] mt-1 max-w-[230px] leading-relaxed">
                    Choose a voice from our library to bring your narration to life.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenVoiceSelector}
                  className="mt-1 h-9 px-4 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>Select Voice Actor</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Speech Parameters Panel */}
          <div className="bg-white dark:bg-[#101521] border border-[#E4E7EF] dark:border-[#1E2638] rounded-2xl p-4 sm:p-5 flex flex-col gap-3.5 sm:gap-4">
            <div className="flex items-center gap-2">
              <AudioWaveform className="w-4 h-4 text-[#2E5BFF] dark:text-[#7A9AFF]" />
              <span className="font-display text-sm font-bold text-[#11162B] dark:text-[#F3F5FA] tracking-tight">
                Speech Parameters
              </span>
            </div>

            {/* Pacing / Speed */}
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <label htmlFor="speed-slider" className="font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                  Pacing / Speed
                </label>
                <div className="flex items-center gap-2">
                  <span className="font-mono tabular-nums font-bold text-[#2E5BFF] dark:text-[#7A9AFF]">
                    {speed.toFixed(2)}x
                  </span>
                  {speed !== 1.0 && (
                    <button
                      type="button"
                      onClick={() => setSpeed(1.0)}
                      className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] underline cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              <div className="py-1">
                <input
                  id="speed-slider"
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

              <div className="grid grid-cols-4 gap-1.5 mt-2">
                {[0.5, 1.0, 1.25, 1.5].map((preset) => {
                  const active = Math.abs(speed - preset) < 0.03;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSpeed(preset)}
                      className={`h-9 rounded-lg text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#EEF2FF] dark:bg-[#4D74FF]/14 text-[#2E5BFF] dark:text-[#7A9AFF] font-bold border border-[#2E5BFF]/30 dark:border-[#4D74FF]/30'
                          : 'bg-[#F7F8FA] dark:bg-[#0D121D] text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] border border-[#E4E7EF] dark:border-[#1E2638]'
                      }`}
                    >
                      {preset === 1 ? '1x' : `${preset}x`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Output File Name */}
            <div>
              <label htmlFor="file-name-input" className="block text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1.5">
                Output File Name
              </label>
              <input
                id="file-name-input"
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="Enter a name for your audio file..."
                className="w-full h-10 px-3.5 py-2 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl text-sm sm:text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:bg-white dark:focus:bg-[#101521] focus:border-[#2E5BFF] dark:focus:border-[#4D74FF] transition-colors"
              />
            </div>

            {/* Word-Aligned Transcript Toggle (OFF by default on new sessions) */}
            <div className="pt-3 border-t border-[#E4E7EF] dark:border-[#1E2638]">
              <Toggle
                id="transcript-toggle"
                checked={withTranscript}
                onChange={setWithTranscript}
                label="Word-Aligned Transcript"
                description={
                  effectiveTranscriptPct > 0
                    ? `Generate word-level timestamps & downloadable .txt file (+${effectiveTranscriptPct}% credits).`
                    : 'Generate word-level timestamps & downloadable .txt file.'
                }
              />
            </div>

            {/* Credit Usage Breakdown (borderless recessed band) */}
            <div className="pt-3 border-t border-[#E4E7EF] dark:border-[#1E2638]">
              <div className="rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-xs font-bold text-[#11162B] dark:text-[#F3F5FA]">
                    Credit Usage
                  </span>
                  <span className="font-mono tabular-nums text-[10.5px] text-[#5A6580] dark:text-[#A2ADC7]">
                    1 credit / char
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#5A6580] dark:text-[#A2ADC7]">Audio Generation</span>
                    <span className="font-mono tabular-nums font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                      {creditEstimate.audioCredits.toLocaleString()} credits
                    </span>
                  </div>

                  {withTranscript ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#5A6580] dark:text-[#A2ADC7]">
                        Word-Aligned Transcript (+{creditEstimate.transcriptSurchargePercent}%)
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-[#2E5BFF] dark:text-[#7A9AFF]">
                        {creditEstimate.transcriptCredits.toLocaleString()} credits
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#5A6580] dark:text-[#A2ADC7]">Transcript Generation</span>
                      <span className="text-[11px] font-medium text-[#78839E] dark:text-[#7C87A3]">
                        Not included
                      </span>
                    </div>
                  )}

                  <div className="pt-1.5 border-t border-[#E4E7EF] dark:border-[#1E2638] flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                      Total Estimated Usage
                    </span>
                    <span className="font-mono tabular-nums font-bold text-[#11162B] dark:text-[#F3F5FA]">
                      {creditEstimate.totalCredits.toLocaleString()} credits
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#E4E7EF] dark:border-[#1E2638] space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#5A6580] dark:text-[#A2ADC7]">Available Credits</span>
                    <span className="font-mono tabular-nums font-semibold text-[#11162B] dark:text-[#F3F5FA]">
                      {remainingCredits.toLocaleString()} credits
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#5A6580] dark:text-[#A2ADC7]">Remaining Credits After Generation</span>
                    <span
                      className={`font-mono tabular-nums font-semibold ${
                        isSignedIn &&
                        (!creditEstimate.hasEnoughCredits || isOverLimit || creditEstimate.remainingCreditsAfter < 0)
                          ? 'text-[#DC2626] dark:text-[#F87171]'
                          : 'text-[#16A34A] dark:text-[#22C55E]'
                      }`}
                    >
                      {creditEstimate.remainingCreditsAfter.toLocaleString()} credits
                    </span>
                  </div>
                </div>

                {isSignedIn &&
                  (isOverLimit ||
                    remainingCredits <= 0 ||
                    (trimmedText.length > 0 && !creditEstimate.hasEnoughCredits)) && (
                    <div className="pt-2 border-t border-[#DC2626]/25 flex items-start gap-2 text-[11px] font-medium text-[#DC2626] dark:text-[#F87171]">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        {creditEstimate.shortfallCredits > 0
                          ? `Insufficient credits: ${creditEstimate.shortfallCredits.toLocaleString()} additional credits required.`
                          : isOverLimit
                          ? `Script exceeds your 1:1 credit character limit by ${(charCount - maxChars).toLocaleString()} chars.`
                          : 'Insufficient credits: 0 credits available in your account.'}
                      </span>
                    </div>
                  )}
              </div>
            </div>

            {/* Google Sign-In Gate Callout for Unauthenticated Visitors */}
            {!isSignedIn && (
              <div className="pt-3 border-t border-[#E4E7EF] dark:border-[#1E2638] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-xs font-bold text-[#11162B] dark:text-[#F3F5FA]">
                    Google Sign-In Required
                  </span>
                  {signupBonusEnabled && welcomeBonusCredits > 0 && (
                    <span className="text-[11px] font-mono tabular-nums font-bold text-[#2E5BFF] dark:text-[#7A9AFF]">
                      +{welcomeBonusCredits.toLocaleString()} Free
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] leading-relaxed">
                  {signupBonusEnabled && welcomeBonusCredits > 0
                    ? `Continue with Google to claim ${welcomeBonusCredits.toLocaleString()} free welcome credits on new accounts and unlock speech generation.`
                    : 'Continue with Google to unlock speech generation with your credit balance.'}
                </p>
                {onOpenSignIn && (
                  <button
                    type="button"
                    onClick={onOpenSignIn}
                    className="w-full h-9 px-3 rounded-xl bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#CFD6E6] dark:border-[#2C364F] hover:border-[#2E5BFF] dark:hover:border-[#4D74FF] text-xs font-bold text-[#11162B] dark:text-[#F3F5FA] flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <GoogleLogoSvg className="w-3.5 h-3.5 shrink-0" />
                    <span>Continue with Google</span>
                  </button>
                )}
              </div>
            )}

            {/* Primary CTA: Generate Speech */}
            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={
                  isGenerating ||
                  (isSignedIn &&
                    (!text.trim() ||
                      isOverLimit ||
                      !selectedVoice ||
                      remainingCredits <= 0 ||
                      !creditEstimate.hasEnoughCredits))
                }
                className={`w-full py-3.5 px-4 rounded-xl font-semibold text-sm transition-all duration-150 flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5BFF]/40 whitespace-nowrap ${
                  isGenerating
                    ? 'bg-[#2E5BFF]/80 dark:bg-[#4D74FF]/80 text-white cursor-not-allowed'
                    : isSignedIn &&
                      (!text.trim() ||
                        isOverLimit ||
                        !selectedVoice ||
                        remainingCredits <= 0 ||
                        !creditEstimate.hasEnoughCredits)
                    ? 'bg-[#E4E7EF] dark:bg-[#1E2638] text-[#78839E] dark:text-[#7C87A3] cursor-not-allowed'
                    : 'bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] active:scale-[0.99] text-white cursor-pointer'
                }`}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>{stageMessage}</span>
                  </>
                ) : !isSignedIn ? (
                  <>
                    <GoogleLogoSvg className="w-4 h-4 shrink-0 bg-white rounded-full p-0.5" />
                    <span>Sign In with Google to Generate</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current shrink-0" />
                    <span>Generate Speech</span>
                  </>
                )}
              </button>

              <p className="text-[11px] text-[#5A6580] dark:text-[#A2ADC7] text-center leading-relaxed">
                {stage === 'idle'
                  ? !isSignedIn
                    ? 'Voice library and sample previews remain open to everyone.'
                    : 'Synthesis takes a moment, and your audio player appears right below.'
                  : stageMessage}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Save Script as Project Modal */}
      <Modal
        isOpen={isSaveProjectOpen}
        onClose={() => setIsSaveProjectOpen(false)}
        title="Save Narration to Project"
        subtitle="Store your current script, selected voice, and speech settings for future reuse."
        maxWidthClass="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!projectNameInput.trim()) return;
            onSaveToProject({
              name: projectNameInput.trim(),
              description: projectDescInput.trim(),
              script: text,
              voiceId: selectedVoice?.id,
              voiceName: selectedVoice?.name,
              speed,
              withTranscript,
              fileName: fileName.trim() || undefined,
            });
            setIsSaveProjectOpen(false);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">
              Project Name *
            </label>
            <input
              type="text"
              required
              value={projectNameInput}
              onChange={(e) => setProjectNameInput(e.target.value)}
              placeholder="e.g. Q4 Product Keynote"
              className="w-full px-3.5 py-2.5 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:bg-white dark:focus:bg-[#101521] focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#11162B] dark:text-[#F3F5FA] mb-1">
              Description
            </label>
            <input
              type="text"
              value={projectDescInput}
              onChange={(e) => setProjectDescInput(e.target.value)}
              placeholder="Short summary of this narration..."
              className="w-full px-3.5 py-2.5 bg-[#F7F8FA] dark:bg-[#0D121D] border border-[#E4E7EF] dark:border-[#1E2638] rounded-xl text-xs text-[#11162B] dark:text-[#F3F5FA] placeholder:text-[#78839E] dark:placeholder:text-[#7C87A3] focus:outline-none focus:bg-white dark:focus:bg-[#101521] focus:border-[#2E5BFF] dark:focus:border-[#4D74FF]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsSaveProjectOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#5A6580] dark:text-[#A2ADC7] hover:text-[#11162B] dark:hover:text-[#F3F5FA] cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#2E5BFF] hover:bg-[#234AE0] dark:bg-[#4D74FF] dark:hover:bg-[#6687FF] text-white text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors"
            >
              Save Project
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
