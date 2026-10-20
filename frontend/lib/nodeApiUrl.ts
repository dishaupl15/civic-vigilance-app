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
  if (!value) return null;

  try {
    const url = new URL(value);
    if (isDevelopment) {
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? value.replace(/\/+$/, '')
        : null;
    }
    if (url.protocol !== 'https:' || isLoopbackHostname(url.hostname)) {
      return null;
    }
    return value.replace(/\/+$/, '');
  } catch {
    return null;
  }
}
