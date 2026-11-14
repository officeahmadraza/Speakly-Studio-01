import { openspeakerRequest } from './openspeakerClient.js';
import { registerObservedAudioHost } from '../config.js';
import type { TranscriptWord, WordAlignedTranscript } from '../../shared/creditPricing.js';

export interface UpstreamTaskResult {
  taskId: string;
  status: 'pending' | 'processing' | 'generating' | 'done' | 'completed' | 'failed' | 'error';
  progress?: number;
  errorMessage?: string | null;
  creditCost?: number | null;
  audioUrl?: string | null;
  createdAt?: string;
  metadata?: Record<string, any>;
  transcriptData?: WordAlignedTranscript | null;
  raw?: any;
}

function roundTime(val: number): number {
  return Math.round(val * 1000) / 1000;
}

function parseTimestampString(raw: string): number | null {
  const clean = raw.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.length === 3) {
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    const s = Number(parts[2]);
    if (Number.isFinite(h) && Number.isFinite(m) && Number.isFinite(s)) {
      return roundTime(h * 3600 + m * 60 + s);
    }
  } else if (parts.length === 2) {
    const m = Number(parts[0]);
    const s = Number(parts[1]);
    if (Number.isFinite(m) && Number.isFinite(s)) {
      return roundTime(m * 60 + s);
    }
  }
  const num = Number(clean);
  return Number.isFinite(num) ? roundTime(num) : null;
}

function extractWordsFromCharacterAlignment(alignment: any): TranscriptWord[] {
  if (!alignment || typeof alignment !== 'object') return [];
  const chars: unknown = alignment.characters;
  const starts: unknown =
    alignment.character_start_times_seconds ?? alignment.char_start_times ?? alignment.starts;
  const ends: unknown =
    alignment.character_end_times_seconds ?? alignment.char_end_times ?? alignment.ends;

  if (!Array.isArray(chars) || !Array.isArray(starts) || !Array.isArray(ends)) {
    return [];
  }

  const words: TranscriptWord[] = [];
  let currentWord = '';
  let currentStart: number | null = null;
  let currentEnd: number | null = null;

  const len = Math.min(chars.length, starts.length, ends.length);
  for (let i = 0; i < len; i++) {
    const ch = String(chars[i] ?? '');
    const st = Number(starts[i]);
    const en = Number(ends[i]);

    if (!ch || /^\s+$/.test(ch)) {
      if (currentWord && currentStart !== null && currentEnd !== null) {
        words.push({
          word: currentWord,
          start: roundTime(currentStart),
          end: roundTime(Math.max(currentStart, currentEnd)),
        });
      }
      currentWord = '';
      currentStart = null;
      currentEnd = null;
      continue;
    }

    currentWord += ch;
    if (currentStart === null && Number.isFinite(st)) {
      currentStart = st;
    }
    if (Number.isFinite(en)) {
      currentEnd = en;
    } else if (currentEnd === null && Number.isFinite(st)) {
      currentEnd = st;
    }
  }

  if (currentWord && currentStart !== null && currentEnd !== null) {
    words.push({
      word: currentWord,
      start: roundTime(currentStart),
      end: roundTime(Math.max(currentStart, currentEnd)),
    });
  }

  return words;
}

function normalizeWordArray(arr: unknown): TranscriptWord[] {
  if (!Array.isArray(arr)) return [];
  const words: TranscriptWord[] = [];

  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, any>;

    // Nested segment with its own words array
    if (Array.isArray(rec.words) && rec.words.length > 0 && rec.word === undefined) {
      words.push(...normalizeWordArray(rec.words));
      continue;
    }

    const rawText = String(rec.word ?? rec.text ?? rec.token ?? rec.value ?? '').trim();
    if (!rawText) continue;

    const rawStart =
      rec.start ?? rec.start_time ?? rec.startTime ?? rec.start_seconds ?? rec.begin ?? rec.offset;
    const rawEnd =
      rec.end ?? rec.end_time ?? rec.endTime ?? rec.end_seconds ?? rec.stop;

    const start =
      typeof rawStart === 'string'
        ? parseTimestampString(rawStart)
        : Number.isFinite(Number(rawStart))
        ? roundTime(Number(rawStart))
        : null;
    const end =
      typeof rawEnd === 'string'
        ? parseTimestampString(rawEnd)
        : Number.isFinite(Number(rawEnd))
        ? roundTime(Number(rawEnd))
        : start;

    if (start === null || end === null) continue;

    const entry: TranscriptWord = {
      word: rawText,
      start: Math.max(0, start),
      end: Math.max(start, end),
    };
    const conf = Number(rec.confidence ?? rec.score);
    if (Number.isFinite(conf) && conf > 0) {
      entry.confidence = roundTime(conf);
    }

    // If a segment object had multiple words without nested word array, split proportionally across cue duration
    if (rawText.includes(' ') && rec.word === undefined) {
      const tokens = rawText.split(/\s+/).filter(Boolean);
      const dur = Math.max(0.05, entry.end - entry.start);
      const totalChars = tokens.reduce((sum, t) => sum + t.length, 0) || tokens.length;
      let cursor = entry.start;
      for (const token of tokens) {
        const share = (token.length / totalChars) * dur;
        words.push({
          word: token,
          start: roundTime(cursor),
          end: roundTime(cursor + share),
        });
        cursor += share;
      }
    } else {
      words.push(entry);
    }
  }

  return words;
}

function parseSrtOrVttTranscript(content: string): TranscriptWord[] {
  const cleaned = content.replace(/\r\n/g, '\n').replace(/^WEBVTT[^\n]*\n+/i, '').trim();
  if (!cleaned) return [];

  const blocks = cleaned.split(/\n{2,}/);
  const words: TranscriptWord[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIdx === -1) continue;

    const [startRaw, endRawPart] = lines[timeLineIdx].split('-->');
    const endRaw = (endRawPart || '').trim().split(/\s+/)[0];
    const start = parseTimestampString(startRaw);
    const end = parseTimestampString(endRaw);
    if (start === null || end === null) continue;

    const cueText = lines
      .slice(timeLineIdx + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (!cueText) continue;

    const tokens = cueText.split(/\s+/).filter(Boolean);
    const dur = Math.max(0.05, end - start);
    const totalChars = tokens.reduce((sum, t) => sum + t.length, 0) || tokens.length;
    let cursor = start;
    for (const token of tokens) {
      const share = (token.length / totalChars) * dur;
      words.push({
        word: token,
        start: roundTime(cursor),
        end: roundTime(cursor + share),
      });
      cursor += share;
    }
  }

  return words;
}

function extractInlineWords(payload: any): { words: TranscriptWord[]; source: string } {
  if (!payload || typeof payload !== 'object') {
    return { words: [], source: 'none' };
  }

  const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};

  // 1. Direct array candidates
  const arrayCandidates: Array<{ label: string; value: unknown }> = [
    { label: 'metadata.words', value: metadata.words },
    { label: 'metadata.word_timestamps', value: metadata.word_timestamps },
    { label: 'metadata.timestamps', value: metadata.timestamps },
    { label: 'metadata.transcript.words', value: metadata.transcript?.words },
    { label: 'metadata.transcript.segments', value: metadata.transcript?.segments },
    { label: 'metadata.transcript', value: Array.isArray(metadata.transcript) ? metadata.transcript : undefined },
    { label: 'metadata.alignment.words', value: metadata.alignment?.words },
    { label: 'metadata.subtitles', value: metadata.subtitles },
    { label: 'metadata.segments', value: metadata.segments },
    { label: 'metadata.chunks', value: metadata.chunks },
    { label: 'task.words', value: payload.words },
    { label: 'task.word_timestamps', value: payload.word_timestamps },
    { label: 'task.timestamps', value: payload.timestamps },
    { label: 'task.transcript.words', value: payload.transcript?.words },
    { label: 'task.transcript', value: Array.isArray(payload.transcript) ? payload.transcript : undefined },
    { label: 'task.alignment.words', value: payload.alignment?.words },
    { label: 'task.subtitles', value: payload.subtitles },
    { label: 'task.segments', value: payload.segments },
  ];

  for (const cand of arrayCandidates) {
    const parsed = normalizeWordArray(cand.value);
    if (parsed.length > 0) {
      return { words: parsed, source: cand.label };
    }
  }

  // 2. Character-level alignment (ElevenLabs format)
  const alignmentCandidates: Array<{ label: string; value: unknown }> = [
    { label: 'metadata.alignment', value: metadata.alignment },
    { label: 'metadata.normalized_alignment', value: metadata.normalized_alignment },
    { label: 'metadata.transcript.alignment', value: metadata.transcript?.alignment },
    { label: 'task.alignment', value: payload.alignment },
    { label: 'task.normalized_alignment', value: payload.normalized_alignment },
  ];

  for (const cand of alignmentCandidates) {
    const parsed = extractWordsFromCharacterAlignment(cand.value);
    if (parsed.length > 0) {
      return { words: parsed, source: cand.label };
    }
  }

  // 3. Inline SRT / VTT string payload
  const stringCandidates: Array<{ label: string; value: unknown }> = [
    { label: 'metadata.srt', value: metadata.srt },
    { label: 'metadata.vtt', value: metadata.vtt },
    { label: 'task.srt', value: payload.srt },
    { label: 'task.vtt', value: payload.vtt },
  ];
  for (const cand of stringCandidates) {
    if (typeof cand.value === 'string' && cand.value.includes('-->')) {
      const parsed = parseSrtOrVttTranscript(cand.value);
      if (parsed.length > 0) {
        return { words: parsed, source: cand.label };
      }
    }
  }

  return { words: [], source: 'none' };
}

async function resolveTranscriptFromTask(
  taskId: string,
  task: any,
  metadata: Record<string, any>
): Promise<WordAlignedTranscript | null> {
  let { words, source } = extractInlineWords(task);

  if (words.length === 0) {
    const remoteUrl =
      metadata?.srt_url ||
      metadata?.srtUrl ||
      metadata?.vtt_url ||
      metadata?.vttUrl ||
      metadata?.transcript_url ||
      metadata?.transcriptUrl ||
      metadata?.subtitles_url ||
      metadata?.json_url ||
      task?.srt_url ||
      task?.transcript_url ||
      task?.subtitles_url;

    if (typeof remoteUrl === 'string' && remoteUrl.trim().startsWith('https://')) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(remoteUrl.trim(), { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          const textBody = await res.text();
          try {
            const parsedJson = JSON.parse(textBody);
            const extracted = Array.isArray(parsedJson)
              ? { words: normalizeWordArray(parsedJson), source: 'remote_json_array' }
              : extractInlineWords({ metadata: parsedJson, ...parsedJson });
            if (extracted.words.length > 0) {
              words = extracted.words;
              source = `remote_url:${extracted.source}`;
            }
          } catch {
            const srtWords = parseSrtOrVttTranscript(textBody);
            if (srtWords.length > 0) {
              words = srtWords;
              source = 'remote_srt_vtt';
            }
          }
        }
      } catch {
        clearTimeout(timer);
      }
    }
  }

  if (words.length === 0) {
    return null;
  }

  const lastEnd = words.reduce((max, w) => Math.max(max, w.end), 0);
  const fullText = words.map((w) => w.word).join(' ');

  return {
    taskId,
    text: fullText,
    charCount: fullText.length,
    wordCount: words.length,
    durationSeconds: roundTime(lastEnd),
    generatedAt: new Date().toISOString(),
    source,
    words,
  };
}

export async function fetchTaskStatus(
  taskId: string,
  options?: { includeTranscript?: boolean }
): Promise<UpstreamTaskResult> {
  const sanitizedTaskId = taskId.trim();
  if (!sanitizedTaskId) {
    throw new Error('Task ID is required');
  }

  const response = await openspeakerRequest<any>({
    method: 'GET',
    path: `/v1/task/${encodeURIComponent(sanitizedTaskId)}`,
    timeoutMs: 15000,
  });

  // Extract task payload (some APIs wrap in { data: ... } or return flat)
  const task = response?.data || response;

  const rawStatus = String(task?.status || 'pending').toLowerCase();
  let status: UpstreamTaskResult['status'] = 'pending';
  if (rawStatus === 'done' || rawStatus === 'completed' || rawStatus === 'success') {
    status = 'done';
  } else if (rawStatus === 'failed' || rawStatus === 'error') {
    status = 'failed';
  } else if (rawStatus === 'processing' || rawStatus === 'generating' || rawStatus === 'in_progress') {
    status = 'processing';
  }

  const metadata = task?.metadata || {};
  const audioUrl = metadata?.audio_url || metadata?.audioUrl || task?.audio_url || task?.audioUrl || null;

  if (audioUrl) {
    try {
      const parsed = new URL(audioUrl);
      registerObservedAudioHost(parsed.hostname);
    } catch {
      // ignore URL parsing error
    }
  }

  const creditCost =
    task?.credit_cost !== undefined ? Number(task.credit_cost) :
    metadata?.credit_cost !== undefined ? Number(metadata.credit_cost) :
    null;

  const errorMessage = task?.error_message || task?.error || metadata?.error_message || null;
  const progress = task?.progress !== undefined ? Number(task.progress) : undefined;

  let transcriptData: WordAlignedTranscript | null | undefined = undefined;
  let safeMetadata = metadata;

  if (options?.includeTranscript === true && status === 'done') {
    transcriptData = await resolveTranscriptFromTask(sanitizedTaskId, task, metadata);
  } else if (metadata && typeof metadata === 'object') {
    // Strip any incidental transcript keys when transcript generation was not requested
    const {
      words: _w,
      word_timestamps: _wt,
      timestamps: _ts,
      alignment: _al,
      normalized_alignment: _nal,
      transcript: _tr,
      subtitles: _sub,
      srt: _srt,
      vtt: _vtt,
      srt_url: _srtUrl,
      vtt_url: _vttUrl,
      transcript_url: _trUrl,
      subtitles_url: _subUrl,
      json_url: _jsonUrl,
      ...restMeta
    } = metadata;
    safeMetadata = restMeta;
  }

  return {
    taskId: sanitizedTaskId,
    status,
    progress,
    errorMessage,
    creditCost,
    audioUrl,
    createdAt: task?.created_at || task?.createdAt,
    metadata: safeMetadata,
    ...(options?.includeTranscript === true ? { transcriptData } : {}),
  };
}
