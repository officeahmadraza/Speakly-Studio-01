import dotenv from 'dotenv';
dotenv.config();

export interface ServerConfig {
  apiKey: string;
  apiBaseUrl: string;
  maxTextChars: number;
  audioHostAllowlist: string[];
  allowAllAudioHosts: boolean;
  port: number;
}

/**
 * Built-in Application Secrets, Variables & Environment Keys
 * Directly embedded into the code so no separate setup is needed.
 */
export const BUILTIN_CONFIG = {
  OPENSPEAKER_API_KEY: 'sk_tcku5694nnz7n52j5culee3g71828dq2a3j4s0fy3mvccqtw',
  MAX_TEXT_CHARS: 50000,
  OPENSPEAKER_API_BASE_URL: 'https://api.ai33.pro',
  AUDIO_HOST_ALLOWLIST: '1',
} as const;

const rawBaseUrl = process.env.OPENSPEAKER_API_BASE_URL || BUILTIN_CONFIG.OPENSPEAKER_API_BASE_URL;
// Strip trailing slash if present
const apiBaseUrl = rawBaseUrl.replace(/\/+$/, '');

const envMaxChars = parseInt(process.env.MAX_TEXT_CHARS || '', 10);
const maxTextChars = !isNaN(envMaxChars) && envMaxChars > 0 ? envMaxChars : BUILTIN_CONFIG.MAX_TEXT_CHARS;

const rawAllowlist = (process.env.AUDIO_HOST_ALLOWLIST || BUILTIN_CONFIG.AUDIO_HOST_ALLOWLIST).trim();
const defaultAllowedHosts = [
  'api.ai33.pro',
  'ai33.pro',
  'r2.cloudflarestorage.com',
  'r2.dev',
  'amazonaws.com',
  'storage.googleapis.com',
  'elevenlabs.io',
  'openspeaker.ai',
  'cloudfront.net',
];
const parsedAllowlist = rawAllowlist
  .split(',')
  .map(h => h.trim().toLowerCase())
  .filter(Boolean);

const isAllowAll = rawAllowlist === '1' || rawAllowlist === 'true' || rawAllowlist === '*';

export const config: ServerConfig = {
  apiKey: (process.env.OPENSPEAKER_API_KEY || BUILTIN_CONFIG.OPENSPEAKER_API_KEY).trim(),
  apiBaseUrl,
  maxTextChars,
  audioHostAllowlist: Array.from(new Set([...defaultAllowedHosts, ...parsedAllowlist])),
  allowAllAudioHosts: isAllowAll,
  port: parseInt(process.env.PORT || '3000', 10),
};

export function isApiKeyConfigured(): boolean {
  return config.apiKey.length > 0;
}

export function registerObservedAudioHost(host: string): void {
  const normalized = host.toLowerCase().trim();
  if (normalized && !config.audioHostAllowlist.includes(normalized)) {
    config.audioHostAllowlist.push(normalized);
  }
}
