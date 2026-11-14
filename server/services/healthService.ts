import { openspeakerRequest, resolveActiveApiConfig } from './openspeakerClient.js';

export interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'error';
  configured: boolean;
  apiBaseUrl: string;
  upstreamHealth?: any;
  message?: string;
  timestamp: string;
}

export async function checkHealth(): Promise<HealthCheckResult> {
  const timestamp = new Date().toISOString();
  const activeCfg = resolveActiveApiConfig();

  if (!activeCfg.configured) {
    return {
      status: 'degraded',
      configured: false,
      apiBaseUrl: activeCfg.apiBaseUrl,
      message: 'Speech AI provider API key is not configured or is disabled in Admin API Management.',
      timestamp,
    };
  }

  try {
    const upstreamRes = await openspeakerRequest({
      method: 'GET',
      path: '/v1/health-check',
      timeoutMs: 8000,
    });

    return {
      status: 'ok',
      configured: true,
      apiBaseUrl: activeCfg.apiBaseUrl,
      upstreamHealth: upstreamRes,
      timestamp,
    };
  } catch (err: any) {
    return {
      status: 'degraded',
      configured: true,
      apiBaseUrl: activeCfg.apiBaseUrl,
      message: `Upstream health check failed: ${err.message}`,
      timestamp,
    };
  }
}
