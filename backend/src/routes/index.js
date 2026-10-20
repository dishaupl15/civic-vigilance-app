const express = require('express');
const router = express.Router();
const { analyzeImage } = require('../ai-analysis');
const { generateReportContent, validateReportInput } = require('../report-content');
const { deleteAccount, exportAccountData, requireSupabaseUser } = require('../supabase-admin');

const analysisAttempts = new Map();
const contentAttempts = new Map();
let lastRateLimitSweep = 0;
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

router.get('/', (_req, res) => {
    res.json({ service: 'civic-vigilance-api', status: 'ok' });
});
router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'civic-vigilance-api' }));

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

router.post('/analyze-image', requireSupabaseUser, analysisRateLimit, requirePrivacyAcknowledgement, async (req, res, next) => {
    try {
        const { image_url: imageUrl } = req.body || {};
        if (typeof imageUrl !== 'string' || !/^https:\/\//i.test(imageUrl)) return res.status(400).json({ error: 'A valid uploaded HTTPS image URL is required.' });
        if (!getOwnedStorageObject(imageUrl, req.authUser.id)) {
            return res.status(400).json({ error: 'The image must be an upload owned by the signed-in user.' });
        }
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
        const report = validateReportInput(req.body?.report);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20_000);
        try {
            const content = await generateReportContent({ input: report, signal: controller.signal });
            res.json({ content });
        } finally {
            clearTimeout(timer);
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            error.message = 'AI writing timed out. Continue manually or retry.';
            error.status = 503;
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
