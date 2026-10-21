const express = require('express');
const router = express.Router();
const { analyzeImage } = require('../ai-analysis');
const { generateReportContent, validateReportInput } = require('../report-content');
const { isGroqConfigured } = require('../groq');
const { adminRequest, deleteAccount, exportAccountData, requireSupabaseUser, UUID_PATTERN } = require('../supabase-admin');
const { createBlueskyPublisher } = require('../bluesky');
const { getSupabaseAdminKey, getSupabaseClientKey } = require('../config');
const xOAuthRouter = require('../x-oauth').createXOAuthRouter();

const analysisAttempts = new Map();
const contentAttempts = new Map();
const blueskyAttempts = new Map();
const blueskyPublisher = createBlueskyPublisher();
let lastRateLimitSweep = 0;
let lastBlueskyRateLimitSweep = 0;
function analysisRateLimit(req, res, next) {
    const key = req.authUser?.id || req.ip || 'unknown';
    const now = Date.now();
    if (now - lastRateLimitSweep >= 60_000 || analysisAttempts.size > 10_000) {
        for (const [storedKey, attempts] of analysisAttempts) {
            if (!attempts.some((time) => now - time < 60_000)) analysisAttempts.delete(storedKey);
        }
        lastRateLimitSweep = now;
    }
    const recent = (analysisAttempts.get(key) || []).filter((time) => now - time < 60_000);
    if (recent.length >= 5) return res.status(429).json({ error: 'Too many analysis requests. Try again shortly.' });
    recent.push(now);
    analysisAttempts.set(key, recent);
    next();
}

function reportContentRateLimit(req, res, next) {
    const key = req.authUser?.id || req.ip || 'unknown';
    const now = Date.now();
    if (now - lastRateLimitSweep >= 60_000 || contentAttempts.size > 10_000) {
        for (const [storedKey, attempts] of contentAttempts) {
            if (!attempts.some((time) => now - time < 60_000)) contentAttempts.delete(storedKey);
        }
        lastRateLimitSweep = now;
    }
    const recent = (contentAttempts.get(key) || []).filter((time) => now - time < 60_000);
    if (recent.length >= 5) return res.status(429).json({ error: 'Too many AI writing requests. Try again shortly.' });
    recent.push(now);
    contentAttempts.set(key, recent);
    next();
}

function blueskyRateLimit(req, res, next) {
    const key = req.authUser?.id || req.ip || 'unknown';
    const now = Date.now();
    if (now - lastBlueskyRateLimitSweep >= 60_000 || blueskyAttempts.size > 10_000) {
        for (const [storedKey, attempts] of blueskyAttempts) {
            if (!attempts.some((time) => now - time < 60_000)) blueskyAttempts.delete(storedKey);
        }
        lastBlueskyRateLimitSweep = now;
    }
    const recent = (blueskyAttempts.get(key) || []).filter((time) => now - time < 60_000);
    if (recent.length >= 3) {
        return res.status(429).json({ error: 'Too many Bluesky publishing requests. Wait before trying again.' });
    }
    recent.push(now);
    blueskyAttempts.set(key, recent);
    next();
}

router.get('/', (_req, res) => {
    res.json({ service: 'civic-vigilance-api', status: 'ok' });
});
router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'civic-vigilance-api' }));
router.use(xOAuthRouter);

router.get('/social/bluesky/status', requireSupabaseUser, async (req, res, next) => {
    try {
        const reportId = req.query.issue_id;
        if (typeof reportId !== 'string' || !UUID_PATTERN.test(reportId)) {
            return res.status(400).json({ error: 'A valid report issue_id is required.' });
        }
        const status = await blueskyPublisher.getAvailability({
            reportId,
            userId: req.authUser.id,
        });
        res.json(status);
    } catch (error) {
        next(error);
    }
});

router.post('/social/bluesky/publish', requireSupabaseUser, blueskyRateLimit, async (req, res, next) => {
    try {
        const body = req.body || {};
        if (Object.keys(body).length !== 1 || typeof body.issue_id !== 'string') {
            return res.status(400).json({ error: 'Provide only the report issue_id to publish.' });
        }
        const publication = await blueskyPublisher.publishIssue({
            reportId: body.issue_id,
            userId: req.authUser.id,
        });
        res.json(publication);
    } catch (error) {
        next(error);
    }
});

function requirePrivacyAcknowledgement(req, res, next) {
    if (req.body?.privacy_notice_accepted !== true) {
        return res.status(400).json({ error: 'Accept the image-analysis privacy notice before continuing.' });
    }
    next();
}

function requireReportContentPrivacyAcknowledgement(req, res, next) {
    if (req.body?.privacy_notice_accepted !== true) {
        return res.status(400).json({ error: 'Accept the AI writing privacy notice before continuing.' });
    }
    next();
}

function getOwnedStorageObject(imageUrl, userId) {
    if (typeof imageUrl !== 'string') return null;
    if (imageUrl.startsWith('supabase-storage://')) {
        let reference;
        try {
            reference = new URL(imageUrl);
        } catch {
            return null;
        }
        const bucket = reference.hostname;
        const path = reference.pathname.split('/').filter(Boolean).map((segment) => {
            try { return decodeURIComponent(segment); } catch { return ''; }
        });
        if (reference.protocol !== 'supabase-storage:' || reference.username || reference.password
            || reference.search || reference.hash || bucket !== 'private-issue-photos'
            || path.length !== 3 || path[0] !== userId || path[1] !== 'issues'
            || path.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('/'))) {
            return null;
        }
        return { access: 'private-reference', bucket, path: path.join('/') };
    }
    let parsed;
    let supabaseUrl;
    try {
        parsed = new URL(imageUrl);
        supabaseUrl = new URL(process.env.SUPABASE_URL);
    } catch {
        return null;
    }
    if (parsed.protocol !== 'https:' || parsed.origin !== supabaseUrl.origin || parsed.username || parsed.password || parsed.hash) {
        return null;
    }

    const segments = parsed.pathname.split('/').filter(Boolean).map((segment) => {
        try { return decodeURIComponent(segment); } catch { return ''; }
    });
    // /storage/v1/object/{public|sign|authenticated}/{bucket}/{user-id}/...
    if (segments.length < 8 || segments[0] !== 'storage' || segments[1] !== 'v1' || segments[2] !== 'object') return null;
    if (!['public', 'sign', 'authenticated'].includes(segments[3])) return null;
    if (!['issue-photos', 'private-issue-photos'].includes(segments[4])) return null;
    if (segments[4] === 'private-issue-photos' && segments[3] !== 'sign') return null;
    if (segments[5] !== userId || segments.slice(5).some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('/'))) return null;
    if (segments[6] !== 'issues') return null;
    return { access: segments[3], bucket: segments[4], path: segments.slice(5).join('/') };
}

async function createOwnedImageUrl(imageReference, userId) {
    const image = getOwnedStorageObject(imageReference, userId);
    if (!image || image.bucket !== 'private-issue-photos') {
        const error = new Error('Upload the selected photo to your private evidence storage before requesting AI assistance.');
        error.status = 400;
        throw error;
    }

    const encodedPath = image.path.split('/').map(encodeURIComponent).join('/');
    const signed = await adminRequest(`/storage/v1/object/sign/${encodeURIComponent(image.bucket)}/${encodedPath}`, {
        method: 'POST',
        body: JSON.stringify({ expiresIn: 120 }),
    });
    const signedPath = signed?.signedURL || signed?.signedUrl;
    if (typeof signedPath !== 'string' || !signedPath) {
        const error = new Error('Could not authorize the selected evidence photo.');
        error.status = 503;
        throw error;
    }
    const supabaseUrl = new URL(process.env.SUPABASE_URL);
    const signedUrl = signedPath.startsWith('https://')
        ? new URL(signedPath)
        : new URL(`/storage/v1${signedPath.startsWith('/') ? signedPath : `/${signedPath}`}`, supabaseUrl.origin);
    if (signedUrl.protocol !== 'https:' || signedUrl.origin !== supabaseUrl.origin) {
        const error = new Error('The selected evidence photo could not be securely authorized.');
        error.status = 503;
        throw error;
    }
    return signedUrl.toString();
}

async function validateImageAsset(imageUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
        const response = await fetch(imageUrl, { method: 'HEAD', signal: controller.signal });
        if (!response.ok) {
            const error = new Error('The selected evidence photo is unavailable.');
            error.status = 400;
            throw error;
        }
        const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        const size = Number(response.headers.get('content-length'));
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
            const error = new Error('Choose a JPEG, PNG, or WebP evidence photo.');
            error.status = 415;
            throw error;
        }
        if (!Number.isSafeInteger(size) || size < 1 || size > 10 * 1024 * 1024) {
            const error = new Error('Evidence photos must be between 1 byte and 10 MB.');
            error.status = 413;
            throw error;
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            error.message = 'Evidence photo validation timed out. Please retry.';
            error.status = 503;
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

function isConfigured(value) {
    return typeof value === 'string' && value.trim().length > 0 && !/YOUR_|your_|example\.com/i.test(value);
}

function isHttpsEndpoint(value) {
    if (!isConfigured(value)) return false;
    try {
        const endpoint = new URL(value);
        return endpoint.protocol === 'https:' && !endpoint.username && !endpoint.password;
    } catch {
        return false;
    }
}

function getReportAiCapabilityStatus() {
    const missing = [];
    const invalid = [];
    const checkPair = (endpointName, keyName) => {
        const endpoint = process.env[endpointName];
        const key = process.env[keyName];
        if (!isConfigured(endpoint)) missing.push(endpointName);
        else if (!isHttpsEndpoint(endpoint)) invalid.push(`${endpointName} (must be a valid HTTPS URL)`);
        if (!isConfigured(key)) missing.push(keyName);
    };

    if (!isGroqConfigured()) {
        const hasLegacyAiConfig = [
            'AI_VISION_ENDPOINT', 'AI_VISION_API_KEY', 'AI_TEXT_ENDPOINT', 'AI_TEXT_API_KEY',
        ].some((name) => isConfigured(process.env[name]));
        if (hasLegacyAiConfig) {
            checkPair('AI_VISION_ENDPOINT', 'AI_VISION_API_KEY');
            checkPair('AI_TEXT_ENDPOINT', 'AI_TEXT_API_KEY');
        } else {
            missing.push('GROQ_API_KEY');
        }
    }
    if (!isConfigured(process.env.SUPABASE_URL)) missing.push('SUPABASE_URL');
    if (!isConfigured(getSupabaseClientKey())) {
        missing.push('SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY');
    }
    if (!isConfigured(getSupabaseAdminKey())) {
        missing.push('SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY');
    }

    return { available: missing.length === 0 && invalid.length === 0, missing, invalid };
}

router.get('/report-ai/capabilities', requireSupabaseUser, (_req, res) => {
    res.json(getReportAiCapabilityStatus());
});

router.post('/analyze-image', requireSupabaseUser, analysisRateLimit, requirePrivacyAcknowledgement, async (req, res, next) => {
    try {
        const { image_reference: imageReference } = req.body || {};
        const imageUrl = await createOwnedImageUrl(imageReference, req.authUser.id);
        await validateImageAsset(imageUrl);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15_000);
        try {
            const analysis = await analyzeImage({ imageUrl, signal: controller.signal });
            res.json({ analysis });
        } finally {
            clearTimeout(timer);
        }
    } catch (error) {
        if (error.name === 'AbortError') error.message = 'Image analysis timed out. Continue manually or retry.';
        next(error);
    }
});

router.post('/generate-report-content', requireSupabaseUser, reportContentRateLimit, requireReportContentPrivacyAcknowledgement, async (req, res, next) => {
    try {
        const imageReference = req.body?.image_reference;
        const report = validateReportInput(req.body?.report, { allowEmptyDescription: true });
        if (typeof imageReference !== 'string' || !imageReference) {
            return res.status(400).json({ error: 'Select and upload an evidence photo before generating report content.' });
        }
        const imageUrl = await createOwnedImageUrl(imageReference, req.authUser.id);
        await validateImageAsset(imageUrl);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 35_000);
        try {
            const analysis = await analyzeImage({ imageUrl, signal: controller.signal });
            const content = await generateReportContent({
                input: report,
                imageAnalysis: analysis,
                signal: controller.signal,
            });
            res.json({ success: true, analysis, content });
        } finally {
            clearTimeout(timer);
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            error.message = 'AI writing timed out. Continue manually or retry.';
            error.status = 503;
            error.safeMessage = 'AI generation timed out. Retry with a smaller photo or check backend connectivity.';
        }
        next(error);
    }
});

router.get('/account/export', requireSupabaseUser, async (req, res, next) => {
    try {
        res.json(await exportAccountData(req.authUser.id));
    } catch (error) {
        next(error);
    }
});

router.delete('/account', requireSupabaseUser, async (req, res, next) => {
    try {
        if (req.headers['x-confirm-account-deletion'] !== 'DELETE') {
            return res.status(400).json({ error: 'Account deletion must be explicitly confirmed.' });
        }
        await deleteAccount(req.authUser.id);
        res.status(204).end();
    } catch (error) {
        next(error);
    }
});

module.exports = router;
module.exports.getOwnedStorageObject = getOwnedStorageObject;
module.exports.getBlueskyPublisher = () => blueskyPublisher;
module.exports.createOwnedImageUrl = createOwnedImageUrl;
module.exports.validateImageAsset = validateImageAsset;
module.exports.getReportAiCapabilityStatus = getReportAiCapabilityStatus;
