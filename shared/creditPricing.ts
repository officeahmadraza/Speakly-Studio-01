export const DEFAULT_CREDITS_PER_CHAR = 1;
export const DEFAULT_CREDIT_COST_PER_1K_CHARS = 1000;
export const DEFAULT_TRANSCRIPT_SURCHARGE_PERCENT = 25;
export const GUEST_PREVIEW_MAX_CHARS = 5000;

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface WordAlignedTranscript {
  taskId: string;
  voiceId?: string;
  voiceName?: string;
  text: string;
  language?: string;
  speed?: number;
  charCount: number;
  wordCount: number;
  durationSeconds?: number;
  generatedAt: string;
  source: string;
  words: TranscriptWord[];
}

export interface CreditBreakdownInput {
  charCount: number;
  withTranscript: boolean;
  availableCredits: number;
  creditCostPer1kChars?: number;
  transcriptSurchargePercent?: number;
}

export interface CreditBreakdownEstimate {
  charCount: number;
  creditCostPer1kChars: number;
  transcriptSurchargePercent: number;
  audioCredits: number;
  transcriptCredits: number;
  totalCredits: number;
  availableCredits: number;
  remainingCreditsAfter: number;
  shortfallCredits: number;
  hasEnoughCredits: boolean;
}

export function getTrimmedCharCount(text: string): number {
  return typeof text === 'string' ? text.trim().length : 0;
}

export function calculateCreditBreakdown(input: CreditBreakdownInput): CreditBreakdownEstimate {
  const charCount = Math.max(0, Math.floor(Number(input.charCount) || 0));
  const surchargePercent =
    input.transcriptSurchargePercent !== undefined && Number.isFinite(Number(input.transcriptSurchargePercent))
      ? Math.max(0, Number(input.transcriptSurchargePercent))
      : DEFAULT_TRANSCRIPT_SURCHARGE_PERCENT;

  const availableCredits = Math.max(0, Math.floor(Number(input.availableCredits) || 0));

  // Strict 1:1 formula: 1 trimmed character = 1 audio credit
  const audioCredits = charCount * DEFAULT_CREDITS_PER_CHAR;
  const transcriptCredits =
    input.withTranscript && charCount > 0 && surchargePercent > 0
      ? Math.ceil(audioCredits * (surchargePercent / 100))
      : 0;
  const totalCredits = audioCredits + transcriptCredits;
  const remainingCreditsAfter = availableCredits - totalCredits;
  const shortfallCredits = Math.max(0, totalCredits - availableCredits);
  const hasEnoughCredits = charCount > 0 ? availableCredits >= totalCredits : availableCredits > 0;

  return {
    charCount,
    creditCostPer1kChars: DEFAULT_CREDIT_COST_PER_1K_CHARS,
    transcriptSurchargePercent: surchargePercent,
    audioCredits,
    transcriptCredits,
    totalCredits,
    availableCredits,
    remainingCreditsAfter,
    shortfallCredits,
    hasEnoughCredits,
  };
}

export function calculateMaxAllowedChars(remainingCredits: number, isSignedIn: boolean): number {
  if (!isSignedIn) {
    return GUEST_PREVIEW_MAX_CHARS;
  }
  return Math.max(0, Math.floor(Number(remainingCredits) || 0));
}

export function formatTimestampBracket(seconds: number): string {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalCentiseconds = Math.max(0, Math.round(safeSeconds * 100));
  const mins = Math.floor(totalCentiseconds / 6000);
  const secs = Math.floor((totalCentiseconds % 6000) / 100);
  const cs = totalCentiseconds % 100;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export interface FormatTranscriptTxtOptions {
  transcript: WordAlignedTranscript;
  fileName?: string;
  totalCharacters?: number;
}

export function formatTranscriptAsTxt({
  transcript,
  fileName,
  totalCharacters,
}: FormatTranscriptTxtOptions): string {
  const resolvedFileName =
    (fileName || transcript.voiceName || `speech_${transcript.taskId || 'audio'}`).trim() || 'My Audio';
  const resolvedCharCount =
    typeof totalCharacters === 'number' && Number.isFinite(totalCharacters)
      ? Math.max(0, Math.floor(totalCharacters))
      : Math.max(0, Math.floor(getTrimmedCharCount(transcript.text || '') || transcript.charCount || 0));

  const lines: string[] = [
    'SPEAKLY STUDIO - WORD-ALIGNED TRANSCRIPT',
    '',
    `File Name: ${resolvedFileName}`,
    `Total Characters: ${resolvedCharCount}`,
    '',
  ];

  for (const item of transcript.words || []) {
    const wordText = String(item?.word ?? '').trim();
    if (!wordText) continue;
    const start = formatTimestampBracket(item.start);
    const end = formatTimestampBracket(item.end);
    lines.push(`[${start} - ${end}] ${wordText}`);
  }

  return `${lines.join('\r\n')}\r\n`;
}
