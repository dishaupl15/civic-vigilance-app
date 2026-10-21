const { adminRequest, UUID_PATTERN } = require('./supabase-admin');

const SERVICE_ENDPOINT = 'https://bsky.social';
const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PUBLICATION_FIELDS = 'report_id,user_id,status,post_uri,post_url';

function makeError(message, status, safeMessage = message) {
  const error = new Error(message);
  error.status = status;
  error.safeMessage = safeMessage;
  return error;
}

function textCharacters(value) {
  return Array.from(value);
}

function formatPostText(report) {
  const title = sanitizePublicText(String(report.title || ''));
  const description = sanitizePublicText(String(report.description || ''));
  const suffix = '\n\n— Civic Vigilance';
  const remaining = Math.max(0, 300 - textCharacters(`${title}\n\n${suffix}`).length);
  const shortDescription = textCharacters(description).slice(0, remaining).join('').trimEnd();
  return `${title}${shortDescription ? `\n\n${shortDescription}` : ''}${suffix}`;
}

function sanitizePublicText(value) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[contact removed]')
    .replace(/\b-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}\b/g, '[location removed]')
    .replace(/\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,4}(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Circle|Cir|Terrace|Ter)\b(?:,?\s*(?:Apt|Apartment|Unit|Suite|#)\s*[A-Za-z0-9-]+)?/gi, '[address removed]')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[contact removed]')
    .replace(/https?:\/\/\S+/gi, '[link removed]')
    .trim();
}

function safePhotoReference(photo, userId, supabaseUrl) {
  if (typeof photo !== 'string') return null;
  if (photo.startsWith('supabase-storage://')) {
    let reference;
    try {
      reference = new URL(photo);
    } catch {
      return null;
    }
    const path = reference.pathname.split('/').filter(Boolean).map(decodeSegment);
    if (reference.protocol !== 'supabase-storage:' || reference.username || reference.password
        || reference.search || reference.hash || reference.hostname !== 'private-issue-photos'
        || path.length !== 3 || path[0] !== userId || path[1] !== 'issues'
        || path.some((part) => !part || part === '.' || part === '..' || part.includes('/'))) return null;
    return { bucket: reference.hostname, path: path.join('/'), private: true };
  }

  let url;
  try {
    url = new URL(photo);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.origin !== supabaseUrl.origin
      || url.username || url.password || url.search || url.hash) return null;
  const parts = url.pathname.split('/').filter(Boolean).map(decodeSegment);
  if (parts.length < 8 || parts[0] !== 'storage' || parts[1] !== 'v1'
      || parts[2] !== 'object' || parts[3] !== 'public'
      || parts[4] !== 'issue-photos' || parts[5] !== userId || parts[6] !== 'issues'
      || parts.slice(5).some((part) => !part || part === '.' || part === '..' || part.includes('/'))) return null;
  return { bucket: parts[4], path: parts.slice(5).join('/'), private: false };
}

function decodeSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

async function readBodyWithinLimit(response, limit) {
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw makeError('The report photo exceeds Civic Vigilance’s 10 MB upload limit.', 413);
      }
      chunks.push(Buffer.from(value));
    }
    if (!length) throw makeError('The report photo is empty.', 422);
    return Buffer.concat(chunks, length);
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (!body.length || body.length > limit) {
    throw makeError(
      body.length > limit ? 'The report photo exceeds Civic Vigilance’s 10 MB upload limit.' : 'The report photo is empty.',
      body.length > limit ? 413 : 422
    );
  }
  return body;
}

async function sanitizePhoto(bytes, sharpImpl) {
  const imageProcessor = sharpImpl || require('sharp');
  for (const preset of [
    { width: 1920, quality: 82 },
    { width: 1600, quality: 76 },
    { width: 1280, quality: 68 },
  ]) {
    const output = await imageProcessor(bytes, { limitInputPixels: 40_000_000, failOn: 'error' })
      .rotate()
      .resize({ width: preset.width, height: 1920, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: preset.quality, mozjpeg: true })
      .toBuffer();
    if (output.length <= MAX_IMAGE_BYTES) return output;
  }
  throw makeError('This photo cannot be reduced enough to meet Bluesky’s 2 MB image limit.', 413);
}

function getProviderStatus(error) {
  return Number(error?.status || error?.statusCode || error?.response?.status || 0);
}

function providerError(error, stage) {
  const status = getProviderStatus(error);
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError'
      || error?.code === 'ETIMEDOUT' || error?.code === 'ECONNRESET') {
    return makeError(
      stage === 'post'
        ? 'Bluesky did not confirm whether the post was created. Check the official account before trying again.'
        : 'The Bluesky service timed out. Please try again.',
      503
    );
  }
  if (status === 401 || status === 403) {
    return makeError('Bluesky rejected the configured app password. Check the server-side account identifier and app password.', 503);
  }
  if (status === 400) return makeError('Bluesky rejected this report. Check its title and description.', 422);
  if (status === 404) return makeError('The configured Bluesky account or service could not be found.', 503);
  if (status === 429) return makeError('Bluesky is rate-limiting posts. Wait before trying again.', 429);
  if (stage === 'post' && (!status || status === 408 || status >= 500)) {
    return makeError(
      'Bluesky did not confirm whether the post was created. Check the official account before trying again.',
      503
    );
  }
  return makeError('Bluesky is temporarily unavailable. Please try again later.', 503);
}

function isUncertainPostError(error) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError'
      || error?.code === 'ETIMEDOUT' || error?.code === 'ECONNRESET') return true;
  const status = getProviderStatus(error);
  return status === 0 || status === 408 || status >= 500;
}

function timeoutPromise(promise, milliseconds) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('Operation timed out.');
      error.name = 'TimeoutError';
      reject(error);
    }, milliseconds);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function createDefaultAgent(identifier, password) {
  const { Agent, CredentialSession } = await import('@atproto/api');
  const session = new CredentialSession(new URL(SERVICE_ENDPOINT));
  await session.login({ identifier, password });
  return new Agent(session);
}

function createBlueskyPublisher({
  adminRequestImpl = adminRequest,
  fetchImpl = (...args) => global.fetch(...args),
  createAgent = createDefaultAgent,
  processImage = sanitizePhoto,
  env = process.env,
} = {}) {
  async function getAvailability({ reportId, userId }) {
    const identifierConfigured = typeof env.BLUESKY_IDENTIFIER === 'string'
      && env.BLUESKY_IDENTIFIER.trim().length > 0;
    const passwordConfigured = typeof env.BLUESKY_APP_PASSWORD === 'string'
      && env.BLUESKY_APP_PASSWORD.trim().length > 0;
    const credentialsConfigured = identifierConfigured && passwordConfigured;
    let migrationReady = false;
    let eligible = false;
    let alreadyPublished = false;
    let publicationPending = false;
    let postUrl;
    let reason = credentialsConfigured ? 'checking_report' : 'credentials_missing';
    if (credentialsConfigured) {
      try {
        await adminRequestImpl('/rest/v1/bluesky_publications?select=report_id&limit=0', { method: 'GET' });
        migrationReady = true;
        const publicationQuery = new URLSearchParams({
          select: 'status,post_url',
          report_id: `eq.${reportId}`,
          user_id: `eq.${userId}`,
          limit: '1',
        });
        const publications = await adminRequestImpl(
          `/rest/v1/bluesky_publications?${publicationQuery}`,
          { method: 'GET' }
        );
        const publication = Array.isArray(publications) ? publications[0] : null;
        alreadyPublished = publication?.status === 'published' && typeof publication.post_url === 'string';
        publicationPending = !alreadyPublished && ['publishing', 'uncertain'].includes(publication?.status);
        if (alreadyPublished) {
          postUrl = publication.post_url;
          reason = 'already_published';
        } else if (publicationPending) {
          reason = 'publication_uncertain';
        }
      } catch {
        reason = 'migration_unavailable';
      }
    }
    if (migrationReady && !alreadyPublished && !publicationPending) {
      const query = new URLSearchParams({
        select: 'id,user_id,privacy,visibility,flagged,moderation_status,status,title,description',
        id: `eq.${reportId}`,
        user_id: `eq.${userId}`,
        limit: '1',
      });
      try {
        const rows = await adminRequestImpl(`/rest/v1/issues?${query}`, { method: 'GET' });
        const report = Array.isArray(rows) ? rows[0] : null;
        if (!report) {
          reason = 'report_unavailable';
        } else if (report.visibility !== 'public' || report.privacy === 'none') {
          reason = 'private_report';
        } else if (report.flagged || report.moderation_status !== 'active') {
          reason = 'report_ineligible';
        } else if (!['pending', 'posted', 'failed'].includes(report.status)) {
          reason = 'report_ineligible';
        } else if (typeof report.title !== 'string' || report.title.trim().length < 10
            || typeof report.description !== 'string' || !report.description.trim()) {
          reason = 'report_incomplete';
        } else {
          eligible = true;
          reason = 'ready';
        }
      } catch {
        reason = 'status_unavailable';
      }
    }
    const configuredIdentifier = String(env.BLUESKY_IDENTIFIER || '').trim().replace(/^@/, '');
    const accountHandle = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(configuredIdentifier)
      ? `@${configuredIdentifier}`
      : undefined;
    return {
      configured: credentialsConfigured,
      ...(credentialsConfigured && accountHandle ? { accountHandle } : {}),
      migrationReady,
      eligible,
      alreadyPublished,
      ...(postUrl ? { postUrl } : {}),
      reason,
    };
  }

  async function loadReport(reportId, userId) {
    const query = new URLSearchParams({
      select: 'id,user_id,title,description,photos,privacy,visibility,flagged,moderation_status,status',
      id: `eq.${reportId}`,
      user_id: `eq.${userId}`,
      limit: '1',
    });
    let reports;
    try {
      reports = await adminRequestImpl(`/rest/v1/issues?${query}`, { method: 'GET' });
    } catch {
      throw makeError('Could not securely load this report. Please try again.', 503);
    }
    const report = Array.isArray(reports) ? reports[0] : null;
    if (!report) throw makeError('Report not found or you do not have permission to publish it.', 404);
    if (report.visibility !== 'public' || report.privacy === 'none') {
      throw makeError('Private reports cannot be published to Bluesky.', 403);
    }
    if (report.flagged || report.moderation_status !== 'active') {
      throw makeError('This report is not currently eligible for public sharing.', 403);
    }
    if (!['pending', 'posted', 'failed'].includes(report.status)) {
      throw makeError('This report is not currently eligible for public sharing.', 403);
    }
    if (typeof report.title !== 'string' || report.title.trim().length < 10
        || typeof report.description !== 'string' || !report.description.trim()) {
      throw makeError('The report needs a title and description before it can be published.', 422);
    }
    return report;
  }

  async function findPublication(reportId) {
    const query = new URLSearchParams({
      select: PUBLICATION_FIELDS,
      report_id: `eq.${reportId}`,
      limit: '1',
    });
    const rows = await adminRequestImpl(`/rest/v1/bluesky_publications?${query}`, { method: 'GET' });
    return Array.isArray(rows) ? rows[0] : null;
  }

  async function reservePublication(reportId, userId) {
    try {
      const inserted = await adminRequestImpl('/rest/v1/bluesky_publications', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ report_id: reportId, user_id: userId, status: 'publishing' }),
      });
      if (Array.isArray(inserted) && inserted.length) return { claimed: true };
    } catch (error) {
      if (error?.upstreamStatus !== 409) {
        throw makeError('Could not reserve this report for safe publication. Please try again.', 503);
      }
    }

    let existing;
    try {
      existing = await findPublication(reportId);
    } catch {
      throw makeError('Could not check this report’s publication status. Please try again.', 503);
    }
    if (!existing || existing.user_id !== userId) {
      throw makeError('Could not reserve this report for safe publication. Please try again.', 503);
    }
    if (existing.status === 'published') {
      return { claimed: false, published: true, postUrl: existing.post_url };
    }
    if (existing.status !== 'failed') {
      throw makeError(
        'A Bluesky post is already in progress or its result is uncertain. Check the official account before trying again.',
        409
      );
    }

    let claimed;
    try {
      const query = new URLSearchParams({
        report_id: `eq.${reportId}`,
        user_id: `eq.${userId}`,
        status: 'eq.failed',
      });
      claimed = await adminRequestImpl(`/rest/v1/bluesky_publications?${query}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          status: 'publishing',
          post_uri: null,
          post_url: null,
          updated_at: new Date().toISOString(),
        }),
      });
    } catch {
      throw makeError('Could not reserve this report for safe publication. Please try again.', 503);
    }
    if (Array.isArray(claimed) && claimed.length) return { claimed: true };
    throw makeError('A Bluesky post is already in progress. Check the official account before trying again.', 409);
  }

  async function setPublicationStatus(reportId, userId, status, post = {}) {
    const query = new URLSearchParams({
      report_id: `eq.${reportId}`,
      user_id: `eq.${userId}`,
      status: 'eq.publishing',
    });
    const updated = await adminRequestImpl(`/rest/v1/bluesky_publications?${query}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status,
        post_uri: post.uri || null,
        post_url: post.url || null,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!Array.isArray(updated) || updated.length === 0) {
      throw makeError('The publication status could not be saved.', 503);
    }
  }

  async function fetchPhoto(photo, userId) {
    let supabaseUrl;
    try {
      supabaseUrl = new URL(env.SUPABASE_URL);
    } catch {
      throw makeError('Photo storage is not configured on the backend.', 503);
    }
    const reference = safePhotoReference(photo, userId, supabaseUrl);
    if (!reference) throw makeError('The report photo is not in your authorized Civic Vigilance storage.', 403);
    let photoUrl;
    if (reference.private) {
      let signed;
      try {
        const encodedPath = reference.path.split('/').map(encodeURIComponent).join('/');
        signed = await adminRequestImpl(
          `/storage/v1/object/sign/${encodeURIComponent(reference.bucket)}/${encodedPath}`,
          { method: 'POST', body: JSON.stringify({ expiresIn: 120 }) }
        );
      } catch {
        throw makeError('The report photo could not be authorized from private storage.', 503);
      }
      const signedPath = signed?.signedURL || signed?.signedUrl;
      if (typeof signedPath !== 'string' || !signedPath) {
        throw makeError('The report photo could not be authorized from private storage.', 503);
      }
      photoUrl = signedPath.startsWith('https://')
        ? new URL(signedPath)
        : new URL(`/storage/v1${signedPath.startsWith('/') ? signedPath : `/${signedPath}`}`, supabaseUrl.origin);
      if (photoUrl.protocol !== 'https:' || photoUrl.origin !== supabaseUrl.origin) {
        throw makeError('The report photo could not be securely authorized.', 503);
      }
    } else {
      photoUrl = new URL(photo);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    let fetchCompleted = false;
    try {
      const response = await fetchImpl(photoUrl.toString(), {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
      });
      fetchCompleted = true;
      if (!response.ok) throw makeError('The report photo is unavailable from Civic Vigilance storage.', 503);
      const mimeType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
        throw makeError('The report photo must be a JPEG, PNG, or WebP image.', 415);
      }
      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > MAX_SOURCE_IMAGE_BYTES) {
        throw makeError('The report photo exceeds Civic Vigilance’s 10 MB upload limit.', 413);
      }
      const bytes = await readBodyWithinLimit(response, MAX_SOURCE_IMAGE_BYTES);
      return { bytes, mimeType };
    } catch (error) {
      if (error?.safeMessage) throw error;
      if (error?.name === 'AbortError') throw makeError('Downloading the report photo timed out.', 503);
      if (error?.status) throw error;
      throw makeError(
        fetchCompleted
          ? 'The report photo could not be read safely.'
          : 'The report photo is unavailable from Civic Vigilance storage.',
        503
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function publishIssue({ reportId, userId }) {
    if (typeof reportId !== 'string' || !UUID_PATTERN.test(reportId)) {
      throw makeError('A valid report ID is required.', 400);
    }
    if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) {
      throw makeError('Authentication is required.', 401);
    }
    const identifier = String(env.BLUESKY_IDENTIFIER || '').trim();
    const password = String(env.BLUESKY_APP_PASSWORD || '').trim();
    if (!identifier || !password) {
      throw makeError('Bluesky publishing is not configured. Set BLUESKY_IDENTIFIER and BLUESKY_APP_PASSWORD on the backend.', 503);
    }

    const report = await loadReport(reportId, userId);
    const reservation = await reservePublication(reportId, userId);
    if (!reservation.claimed) {
      return { status: 'published', alreadyPublished: true, postUrl: reservation.postUrl };
    }

    let stage = 'login';
    try {
      const agent = await timeoutPromise(createAgent(identifier, password), 15_000);
      let embed;
      const photos = Array.isArray(report.photos) ? report.photos : [];
      if (photos.length && photos[0]) {
        stage = 'photo';
        const photo = await fetchPhoto(photos[0], userId);
        let publicPhoto;
        try {
          publicPhoto = await processImage(photo.bytes);
        } catch (error) {
          if (error?.safeMessage) throw error;
          throw makeError('The report photo could not be safely prepared for public sharing.', 422);
        }
        const uploaded = await timeoutPromise(agent.uploadBlob(publicPhoto, { encoding: 'image/jpeg' }), 20_000);
        const blob = uploaded?.data?.blob || uploaded?.blob;
        if (!blob) throw makeError('Bluesky did not accept the report photo.', 503);
        embed = {
          $type: 'app.bsky.embed.images',
          images: [{
            alt: `Evidence photo for civic issue: ${sanitizePublicText(String(report.title)).slice(0, 160)}`,
            image: blob,
          }],
        };
      }

      stage = 'post';
      const result = await timeoutPromise(agent.post({
        text: formatPostText(report),
        ...(embed ? { embed } : {}),
      }), 25_000);
      const uri = typeof result?.uri === 'string' ? result.uri : '';
      const match = uri.match(/^at:\/\/(did:[a-z0-9]+:[A-Za-z0-9._:%-]+)\/app\.bsky\.feed\.post\/([A-Za-z0-9._~:-]+)$/);
      if (!match || typeof result?.cid !== 'string' || !result.cid) {
        await setPublicationStatus(reportId, userId, 'uncertain');
        throw makeError(
          'Bluesky may have created the post, but its link could not be confirmed. Check the official account before trying again.',
          503
        );
      }
      const postUrl = `https://bsky.app/profile/${match[1]}/post/${encodeURIComponent(match[2])}`;
      await setPublicationStatus(reportId, userId, 'published', { uri, url: postUrl });
      return { status: 'published', alreadyPublished: false, postUri: uri, postUrl };
    } catch (error) {
      if (error?.status === 503 && /may have created|did not confirm/.test(error.message)) throw error;
      const mapped = error?.safeMessage ? error : providerError(error, stage);
      try {
        await setPublicationStatus(reportId, userId, stage === 'post' && isUncertainPostError(error) ? 'uncertain' : 'failed');
      } catch {
        throw makeError(
          'Bluesky publication could not be safely confirmed. Check the official account before trying again.',
          503
        );
      }
      throw mapped;
    }
  }

  return { getAvailability, publishIssue };
}

module.exports = {
  createBlueskyPublisher,
  formatPostText,
  sanitizePublicText,
  sanitizePhoto,
  safePhotoReference,
};
