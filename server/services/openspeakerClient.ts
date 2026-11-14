import { config } from '../config.js';
import { readDatabase, runDbTransaction } from '../db/database.js';
import { decryptSecret } from './cryptoVault.js';

export class OpenSpeakerError extends Error {
  statusCode: number;
  retryAfter?: number;
  details?: unknown;

  constructor(message: string, statusCode: number = 500, retryAfter?: number, details?: unknown) {
    super(message);
    this.name = 'OpenSpeakerError';
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
    this.details = details;
  }
}

export interface ResolvedApiConfig {
  integrationId: string | null;
  apiBaseUrl: string;
  apiKey: string;
  modelName: string;
  configured: boolean;
}

export function resolveActiveApiConfig(): ResolvedApiConfig {
  try {
    const db = readDatabase();
    const integrations = db.apiIntegrations || [];
    const primaryEnabled =
      integrations.find((i) => i.isPrimary && i.isEnabled && i.encryptedApiKey) ||
      integrations.find((i) => i.isEnabled && i.encryptedApiKey);

    if (primaryEnabled) {
      const decrypted = decryptSecret(primaryEnabled.encryptedApiKey);
      if (decrypted) {
        return {
          integrationId: primaryEnabled.id,
          apiBaseUrl: (primaryEnabled.endpointUrl || config.apiBaseUrl).replace(/\/+$/, ''),
          apiKey: decrypted,
          modelName: primaryEnabled.modelName || 'eleven_multilingual_v2',
          configured: true,
        };
      }
    }

    // If admin explicitly disabled all configured integrations, respect disabled state
    const hasAnyConfiguredIntegration = integrations.some((i) => Boolean(i.encryptedApiKey));
    if (hasAnyConfiguredIntegration && !integrations.some((i) => i.isEnabled)) {
      return {
        integrationId: null,
        apiBaseUrl: config.apiBaseUrl,
        apiKey: '',
        modelName: 'eleven_multilingual_v2',
        configured: false,
      };
    }
  } catch {
    // Fallback to env config during very early boot
  }

  return {
    integrationId: null,
    apiBaseUrl: config.apiBaseUrl,
    apiKey: config.apiKey,
    modelName: 'eleven_multilingual_v2',
    configured: Boolean(config.apiKey && config.apiKey.trim().length > 0),
  };
}

export function sanitizeUpstreamErrorMessage(msg: string, secretKey?: string): string {
  let clean = msg || 'Upstream request failed';
  if (secretKey && secretKey.length > 4) {
    clean = clean.split(secretKey).join('[REDACTED]');
  }
  if (config.apiKey && config.apiKey.length > 4) {
    clean = clean.split(config.apiKey).join('[REDACTED]');
  }
  return clean;
}

export async function recordIntegrationTelemetry(params: {
  integrationId: string | null;
  endpoint: string;
  success: boolean;
  statusCode: number;
  estimatedCostUsd?: number;
  errorMessage?: string;
}): Promise<void> {
  if (!params.integrationId) return;
  try {
    await runDbTransaction((db) => {
      const target = db.apiIntegrations.find((i) => i.id === params.integrationId);
      if (!target) return;
      target.usageCount += 1;
      if (params.estimatedCostUsd && params.estimatedCostUsd > 0) {
        target.totalEstimatedCostUsd =
          Math.round((target.totalEstimatedCostUsd + params.estimatedCostUsd) * 10000) / 10000;
      }
      target.lastStatus = params.success
        ? 'connected'
        : params.statusCode === 503 || params.statusCode === 429
        ? 'degraded'
        : 'error';
      target.lastTestedAt = new Date().toISOString();
      if (!params.success && params.errorMessage) {
        target.lastStatusMessage = params.errorMessage;
        target.recentErrors.unshift({
          id: `apierr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          message: params.errorMessage,
          statusCode: params.statusCode,
          endpoint: params.endpoint,
          createdAt: new Date().toISOString(),
        });
        if (target.recentErrors.length > 50) {
          target.recentErrors = target.recentErrors.slice(0, 50);
        }
      } else if (params.success) {
        target.lastStatusMessage = 'Operational';
      }
      target.updatedAt = new Date().toISOString();
    }, { allowLocalFallback: true });
  } catch {
    // Non-blocking telemetry
  }
}

interface RequestOptions {
  method?: string;
  path: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
  overrideConfig?: {
    integrationId?: string | null;
    apiBaseUrl: string;
    apiKey: string;
  };
}

const TRANSIENT_STATUS_CODES = new Set([429, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function openspeakerRequest<T = any>(options: RequestOptions): Promise<T> {
  const activeCfg = options.overrideConfig
    ? {
        integrationId: options.overrideConfig.integrationId ?? null,
        apiBaseUrl: options.overrideConfig.apiBaseUrl.replace(/\/+$/, ''),
        apiKey: options.overrideConfig.apiKey,
        configured: Boolean(options.overrideConfig.apiKey?.trim()),
      }
    : resolveActiveApiConfig();

  if (!activeCfg.configured) {
    throw new OpenSpeakerError(
      'Speech AI provider API key is not configured or is currently disabled.',
      503
    );
  }

  const {
    method = 'GET',
    path,
    body,
    headers = {},
    timeoutMs = 30000,
    maxRetries = method.toUpperCase() === 'GET' ? 2 : 1,
  } = options;

  const url = `${activeCfg.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const requestHeaders: Record<string, string> = {
    'xi-api-key': activeCfg.apiKey,
    ...headers,
  };

  let lastError: OpenSpeakerError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: requestHeaders,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const retryAfterHeader = res.headers.get('Retry-After');
        const parsedRetryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
        const retryAfter = !isNaN(parsedRetryAfter) && parsedRetryAfter > 0 ? parsedRetryAfter : undefined;

        let errorBody: any = null;
        try {
          const text = await res.text();
          try {
            errorBody = JSON.parse(text);
          } catch {
            errorBody = text;
          }
        } catch {
          // failed reading body
        }

        if (res.status === 401 || res.status === 403) {
          const err = new OpenSpeakerError(
            'API authentication failed. Please check the server-side API configuration.',
            401,
            undefined,
            errorBody
          );
          void recordIntegrationTelemetry({
            integrationId: activeCfg.integrationId,
            endpoint: path,
            success: false,
            statusCode: 401,
            errorMessage: err.message,
          });
          throw err;
        }

        const err =
          res.status === 429
            ? new OpenSpeakerError(
                'Rate limit exceeded upstream. Please wait before retrying.',
                429,
                retryAfter,
                errorBody
              )
            : res.status === 503
            ? new OpenSpeakerError(
                'OpenSpeaker service is currently busy or unavailable. Please retry in a few moments.',
                503,
                retryAfter,
                errorBody
              )
            : new OpenSpeakerError(
                sanitizeUpstreamErrorMessage(
                  (typeof errorBody === 'object' && errorBody?.message) ||
                    (typeof errorBody === 'object' && errorBody?.error) ||
                    (typeof errorBody === 'string' && errorBody.length > 0 && errorBody.length < 200
                      ? errorBody
                      : null) ||
                    `Upstream request failed with status ${res.status}`,
                  activeCfg.apiKey
                ),
                res.status,
                retryAfter,
                errorBody
              );

        if (TRANSIENT_STATUS_CODES.has(res.status) && attempt < maxRetries) {
          lastError = err;
          const backoffMs = retryAfter
            ? Math.min(retryAfter * 1000, 4000)
            : Math.min(800 * Math.pow(2, attempt) + Math.floor(Math.random() * 350), 4000);
          console.warn(
            `[OpenSpeakerClient] Transient HTTP ${res.status} on ${method} ${path} (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${backoffMs}ms...`
          );
          await sleep(backoffMs);
          continue;
        }

        void recordIntegrationTelemetry({
          integrationId: activeCfg.integrationId,
          endpoint: path,
          success: false,
          statusCode: err.statusCode,
          errorMessage: err.message,
        });
        throw err;
      }

      const contentType = res.headers.get('content-type') || '';
      void recordIntegrationTelemetry({
        integrationId: activeCfg.integrationId,
        endpoint: path,
        success: true,
        statusCode: res.status,
      });

      if (contentType.includes('application/json')) {
        return (await res.json()) as T;
      }

      return (await res.text()) as unknown as T;
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err instanceof OpenSpeakerError) {
        if (!TRANSIENT_STATUS_CODES.has(err.statusCode) || attempt >= maxRetries) {
          throw err;
        }
        lastError = err;
      } else if (err.name === 'AbortError') {
        const timeoutErr = new OpenSpeakerError('Request to OpenSpeaker API timed out.', 504);
        if (attempt >= maxRetries) {
          void recordIntegrationTelemetry({
            integrationId: activeCfg.integrationId,
            endpoint: path,
            success: false,
            statusCode: 504,
            errorMessage: timeoutErr.message,
          });
          throw timeoutErr;
        }
        lastError = timeoutErr;
      } else {
        const netErr = new OpenSpeakerError(
          sanitizeUpstreamErrorMessage(
            `Network connection to OpenSpeaker failed: ${err.message || 'Unknown network error'}`,
            activeCfg.apiKey
          ),
          502
        );
        if (attempt >= maxRetries) {
          void recordIntegrationTelemetry({
            integrationId: activeCfg.integrationId,
            endpoint: path,
            success: false,
            statusCode: 502,
            errorMessage: netErr.message,
          });
          throw netErr;
        }
        lastError = netErr;
      }

      const backoffMs = Math.min(800 * Math.pow(2, attempt) + Math.floor(Math.random() * 350), 4000);
      console.warn(
        `[OpenSpeakerClient] Retryable error on ${method} ${path} (attempt ${attempt + 1}/${maxRetries + 1}): ${lastError.message}. Retrying in ${backoffMs}ms...`
      );
      await sleep(backoffMs);
    }
  }

  throw lastError || new OpenSpeakerError('OpenSpeaker request failed after retries.', 503);
}
