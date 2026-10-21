const GROQ_MODEL = 'qwen/qwen3.8-27b';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 32 * 1024;
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function isGroqConfigured() {
  const key = process.env.GROQ_API_KEY;
  return typeof key === 'string' && key.trim().length > 0 && !/YOUR_|your_|example\.com/i.test(key);
}

function providerError(message, status = 503, safeMessage = message) {
  return Object.assign(new Error(message), { status, safeMessage });
}

async function readImage(imageUrl, { signal, fetchImpl }) {
  let url;
  try {
    url = new URL(imageUrl);
  } catch {
    throw providerError('The selected evidence photo could not be read.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw providerError('The selected evidence photo could not be read.');
  }

  let response;
  try {
    response = await fetchImpl(url, { signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw providerError(
      'Private evidence image download failed.',
      503,
      'The backend could not download the private evidence photo. Check Supabase Storage access and retry.'
    );
  }
  if (!response.ok) {
    throw providerError(
      `Private evidence image download returned HTTP ${response.status}.`,
      503,
      'The backend could not download the private evidence photo. Check Supabase Storage access and retry.'
    );
  }

  const mimeType = String(response.headers?.get?.('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!IMAGE_MIME_TYPES.has(mimeType)) {
    throw providerError('Choose a JPEG, PNG, or WebP evidence photo.', 415);
  }

  let image;
  try {
    const contentLength = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      throw providerError('Evidence photos must be between 1 byte and 10 MB.', 413);
    }
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let totalBytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          if (totalBytes > MAX_IMAGE_BYTES) {
            await reader.cancel();
            throw providerError('Evidence photos must be between 1 byte and 10 MB.', 413);
          }
          chunks.push(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }
      image = Buffer.concat(chunks, totalBytes);
    } else {
      image = Buffer.from(await response.arrayBuffer());
    }
  } catch (error) {
    if (error.name === 'AbortError' || error.status === 413) throw error;
    throw providerError('The selected evidence photo could not be read.');
  }
  if (image.length < 1 || image.length > MAX_IMAGE_BYTES) {
    throw providerError('Evidence photos must be between 1 byte and 10 MB.', 413);
  }
  return { data: image.toString('base64'), mimeType };
}

function safeProviderFailure(status) {
  if (status === 400) {
    return providerError(
      'Groq rejected the request format with HTTP 400.',
      502,
      'Groq rejected the request format (HTTP 400). Check the backend model and JSON-mode prompt.'
    );
  }
  if (status === 401 || status === 403) {
    return providerError(
      `Groq rejected the configured API key or access with HTTP ${status}.`,
      503,
      `Groq rejected the backend API key or model access (HTTP ${status}). Verify GROQ_API_KEY and the model access in GroqCloud.`
    );
  }
  if (status === 404) {
    return providerError(
      'Groq model endpoint returned HTTP 404.',
      503,
      'The configured Groq model is unavailable (HTTP 404). Check the active model list in GroqCloud.'
    );
  }
  if (status === 429) {
    return providerError(
      'Groq rate limit or quota reached.',
      429,
      'Groq rate limit or free-plan quota was reached. Check GroqCloud usage limits and try again later.'
    );
  }
  return providerError(
    `Groq API returned HTTP ${status}.`,
    503,
    `Groq is temporarily unavailable (HTTP ${status}). Retry later; if this persists, check backend logs and GroqCloud status.`
  );
}

async function generateGroqJson({ prompt, imageUrl, signal, fetchImpl = fetch }) {
  if (!isGroqConfigured()) {
    throw providerError('Groq report assistance is not configured.');
  }

  const content = [{ type: 'text', text: prompt }];
  if (imageUrl) {
    const image = await readImage(imageUrl, { signal, fetchImpl });
    content.push({
      type: 'image_url',
      image_url: { url: `data:${image.mimeType};base64,${image.data}` },
    });
  }

  let response;
  try {
    response = await fetchImpl(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.GROQ_API_KEY.trim()}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: 'Return exactly one JSON object. Follow the requested field names and constraints. Use only supported facts; do not invent details.',
          },
          { role: 'user', content },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_completion_tokens: 1200,
        stream: false,
      }),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw providerError(
      'Groq API network request failed.',
      503,
      'The backend could not reach Groq. Check backend internet access and retry.'
    );
  }

  if (!response.ok) {
    throw safeProviderFailure(response.status);
  }

  let envelope;
  try {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
      throw providerError(
        'Groq response exceeded the allowed size.',
        502,
        'Groq returned an unexpectedly large response. Retry, and check backend logs if this continues.'
      );
    }
    envelope = JSON.parse(text);
  } catch (error) {
    if (error.status) throw error;
    throw providerError(
      'Groq response envelope was invalid.',
      502,
      'Groq returned an invalid response. Retry, and check backend logs if this continues.'
    );
  }
  const output = envelope?.choices?.[0]?.message?.content;
  if (typeof output !== 'string' || !output.trim()) {
    throw providerError(
      'Groq response did not include JSON content.',
      502,
      'Groq did not return report content. Retry, and check backend logs if this continues.'
    );
  }
  try {
    return JSON.parse(output);
  } catch {
    throw providerError(
      'Groq response content was not valid JSON.',
      502,
      'Groq returned content that did not match the requested JSON format. Retry, and check backend logs if this continues.'
    );
  }
}

module.exports = { generateGroqJson, isGroqConfigured };
