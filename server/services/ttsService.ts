import { openspeakerRequest, OpenSpeakerError } from './openspeakerClient.js';

export interface TTSGenerateInput {
  text: string;
  voiceId: string;
  speed?: number;
  withTranscript?: boolean;
  fileName?: string;
}

export interface TTSGenerateResult {
  success: boolean;
  taskId: string;
  voiceId: string;
  characterCount: number;
  wordCount: number;
  fileName?: string;
}

export interface TTSValidationOptions {
  maxAllowedChars?: number;
}

/**
 * Validate TTS generation input parameters
 */
export function validateTTSInput(input: TTSGenerateInput, options?: TTSValidationOptions): void {
  // Validate text
  if (!input.text || typeof input.text !== 'string' || input.text.trim().length === 0) {
    throw new OpenSpeakerError('Text is required for speech generation.', 400);
  }

  const trimmedText = input.text.trim();
  const dynamicLimit =
    options?.maxAllowedChars !== undefined
      ? Math.max(0, Math.floor(options.maxAllowedChars))
      : undefined;

  if (dynamicLimit !== undefined && trimmedText.length > dynamicLimit) {
    throw new OpenSpeakerError(
      `Text exceeds your available credit-based character limit of ${dynamicLimit.toLocaleString()} characters (1 credit = 1 character; received ${trimmedText.length.toLocaleString()}).`,
      400
    );
  }

  // Validate voice ID
  if (!input.voiceId || typeof input.voiceId !== 'string' || input.voiceId.trim().length === 0) {
    throw new OpenSpeakerError('A valid Voice ID is required.', 400);
  }

  // Validate speed if provided
  if (input.speed !== undefined && input.speed !== null) {
    const numSpeed = Number(input.speed);
    if (isNaN(numSpeed) || numSpeed < 0.5 || numSpeed > 1.5) {
      throw new OpenSpeakerError('Speed must be a number between 0.5 and 1.5.', 400);
    }
  }
}

/**
 * Single serialization function for upstream POST /v3/text-to-speech multipart FormData
 */
function serializeTTSFormData(input: TTSGenerateInput): FormData {
  const formData = new FormData();

  // text: required
  formData.append('text', input.text.trim());

  // voice_id: keep elevenlabs_ prefix exactly as specified
  const voiceId = input.voiceId.trim();
  formData.append('voice_id', voiceId);

  // optional speed: 0.5 - 1.5
  if (input.speed !== undefined && input.speed !== null) {
    const numSpeed = Math.round(Number(input.speed) * 100) / 100;
    formData.append('speed', String(numSpeed));
  }

  // optional with_transcript
  if (input.withTranscript !== undefined && input.withTranscript !== null) {
    formData.append('with_transcript', input.withTranscript ? 'true' : 'false');
  }

  // optional file_name
  if (input.fileName && input.fileName.trim().length > 0) {
    // Sanitize filename to safe chars
    const sanitizedName = input.fileName.trim().replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    formData.append('file_name', sanitizedName);
  }

  return formData;
}

/**
 * Execute TTS task creation against upstream
 */
export async function createTTSTask(
  input: TTSGenerateInput,
  options?: TTSValidationOptions
): Promise<TTSGenerateResult> {
  validateTTSInput(input, options);

  const textLength = input.text.trim().length;
  const wordCount = input.text.trim().split(/\s+/).filter(Boolean).length;

  console.log(`[TTSService] Initiating speech task for voice_id="${input.voiceId}", text length=${textLength} chars, ${wordCount} words`);

  const formData = serializeTTSFormData(input);

  const response = await openspeakerRequest<{
    success?: boolean;
    task_id?: string;
    taskId?: string;
    id?: string;
    message?: string;
  }>({
    method: 'POST',
    path: '/v3/text-to-speech',
    body: formData,
    timeoutMs: 30000,
  });

  const taskId = response.task_id || response.taskId || response.id;

  if (!taskId) {
    throw new OpenSpeakerError(
      response.message || 'Upstream service did not return a valid task ID.',
      502
    );
  }

  console.log(`[TTSService] Task created successfully. Task ID: ${taskId}`);

  return {
    success: true,
    taskId,
    voiceId: input.voiceId,
    characterCount: textLength,
    wordCount,
    fileName: input.fileName ? input.fileName.trim() : undefined,
  };
}
