const allowedOrigins = new Set(
  (Deno.env.get('ALLOWED_ORIGIN') || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),
);

function responseHeaders(req: Request) {
  const origin = req.headers.get('origin')?.replace(/\/$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return headers;
}

export function retiredTwitterHandler(message: string, code: string) {
  return (req: Request) => {
    const headers = responseHeaders(req);
    const origin = req.headers.get('origin')?.replace(/\/$/, '');
    if (origin && !allowedOrigins.has(origin)) {
      return new Response(JSON.stringify({ error: 'Origin is not allowed.' }), { status: 403, headers });
    }
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed.' }), { status: 405, headers });
    }
    return new Response(JSON.stringify({ error: message, code }), { status: 410, headers });
  };
}
