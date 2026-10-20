export const PRODUCTION_NODE_API_BASE_URL = 'https://civic-vigilance-app.vercel.app/api';

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname.endsWith('.localhost');
}

export function resolveNodeApiBaseUrl(
  configuredUrl: string | undefined,
  isDevelopment: boolean,
): string | null {
  const value = configuredUrl?.trim();
  if (!value) return isDevelopment ? null : PRODUCTION_NODE_API_BASE_URL;

  try {
    const url = new URL(value);
    if (isDevelopment) {
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? value.replace(/\/+$/, '')
        : null;
    }
    if (url.protocol !== 'https:' || isLoopbackHostname(url.hostname)) {
      return PRODUCTION_NODE_API_BASE_URL;
    }
    return value.replace(/\/+$/, '');
  } catch {
    return isDevelopment ? null : PRODUCTION_NODE_API_BASE_URL;
  }
}
