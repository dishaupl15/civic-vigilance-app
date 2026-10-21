const {
  createBlueskyPublisher,
  formatPostText,
  safePhotoReference,
  sanitizePhoto,
  sanitizePublicText,
} = require('../src/bluesky');

const reportId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const report = {
  id: reportId,
  user_id: userId,
  title: 'Overflowing roadside waste',
  description: 'Mixed waste is visible beside the road.',
  status: 'pending',
  photos: [],
  privacy: 'twitter',
  visibility: 'public',
  flagged: false,
  moderation_status: 'active',
};

function createHarness({
  issue = report,
  credentials = true,
  agentOverrides = {},
  fetchImpl,
  processImage,
  migrationError = false,
} = {}) {
  const publications = new Map();
  const calls = [];
  const agent = {
    uploadBlob: jest.fn().mockResolvedValue({
      data: { blob: { ref: { $link: 'blob-cid' }, mimeType: 'image/jpeg', size: 2 } },
    }),
    post: jest.fn().mockResolvedValue({
      uri: 'at://did:plc:civic/app.bsky.feed.post/postkey',
      cid: 'post-cid',
    }),
    ...agentOverrides,
  };
  const adminRequestImpl = jest.fn(async (path, options = {}) => {
    calls.push({ path, options });
    const method = options.method || 'GET';
    if (path.startsWith('/rest/v1/issues?')) return issue ? [issue] : [];
    if (migrationError && path.includes('bluesky_publications?select=report_id&limit=0')) {
      throw new Error('table not found');
    }
    if (path === '/rest/v1/bluesky_publications' && method === 'POST') {
      if (publications.has(reportId)) {
        const error = new Error('Duplicate');
        error.upstreamStatus = 409;
        throw error;
      }
      const row = { report_id: reportId, user_id: userId, status: 'publishing', post_uri: null, post_url: null };
      publications.set(reportId, row);
      return [row];
    }
    if (path.startsWith('/rest/v1/bluesky_publications?') && method === 'GET') {
      const row = publications.get(reportId);
      return row ? [{ ...row }] : [];
    }
    if (path.startsWith('/rest/v1/bluesky_publications?') && method === 'PATCH') {
      const row = publications.get(reportId);
      if (!row || !path.includes('status=eq.publishing')) return [];
      Object.assign(row, JSON.parse(options.body));
      return [{ ...row }];
    }
    if (path.startsWith('/storage/v1/object/sign/')) {
      return { signedURL: '/storage/v1/object/sign/private-issue-photos/photo?token=private' };
    }
    throw new Error(`Unexpected mocked admin request: ${method} ${path}`);
  });
  const env = {
    SUPABASE_URL: 'https://civic.supabase.co',
    ...(credentials ? {
      BLUESKY_IDENTIFIER: 'civic.bsky.social',
      BLUESKY_APP_PASSWORD: 'xxxx-xxxx-xxxx-xxxx',
    } : {}),
  };
  const publisher = createBlueskyPublisher({
    adminRequestImpl,
    fetchImpl: fetchImpl || jest.fn(),
    createAgent: jest.fn().mockResolvedValue(agent),
    processImage: processImage || (async (bytes) => bytes),
    env,
  });
  return { publisher, agent, adminRequestImpl, publications, calls };
}

function imageResponse(mimeType = 'image/jpeg', bytes = [1, 2, 3]) {
  return {
    ok: true,
    headers: { get: (name) => (name === 'content-type' ? mimeType : String(bytes.length)) },
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  };
}

test('publishes validated text-only report and returns the public post link', async () => {
  const { publisher, agent, publications, calls } = createHarness();
  const result = await publisher.publishIssue({ reportId, userId });
  const reportQuery = calls.find((call) => call.path.startsWith('/rest/v1/issues?'));
  expect(new URLSearchParams(reportQuery.path.split('?')[1]).get('select').split(','))
    .toContain('status');
  expect(agent.post).toHaveBeenCalledWith({
    text: 'Overflowing roadside waste\n\nMixed waste is visible beside the road.\n\n— Civic Vigilance',
  });
  expect(agent.uploadBlob).not.toHaveBeenCalled();
  expect(result).toEqual({
    status: 'published',
    alreadyPublished: false,
    postUri: 'at://did:plc:civic/app.bsky.feed.post/postkey',
    postUrl: 'https://bsky.app/profile/did:plc:civic/post/postkey',
  });
  expect(publications.get(reportId).status).toBe('published');
});

test('reports safe account and report eligibility without exposing credentials', async () => {
  const ready = createHarness();
  await expect(ready.publisher.getAvailability({ reportId, userId })).resolves.toEqual({
    configured: true,
    accountHandle: '@civic.bsky.social',
    migrationReady: true,
    eligible: true,
    alreadyPublished: false,
    reason: 'ready',
  });
  ready.publications.set(reportId, {
    report_id: reportId,
    user_id: userId,
    status: 'uncertain',
    post_uri: null,
    post_url: null,
  });
  await expect(ready.publisher.getAvailability({ reportId, userId })).resolves.toMatchObject({
    eligible: false,
    alreadyPublished: false,
    reason: 'publication_uncertain',
  });
  const privateReport = createHarness({ issue: { ...report, privacy: 'none', visibility: 'private' } });
  await expect(privateReport.publisher.getAvailability({ reportId, userId })).resolves.toMatchObject({
    configured: true,
    migrationReady: true,
    eligible: false,
    reason: 'private_report',
  });
  const unconfigured = createHarness({ credentials: false });
  await expect(unconfigured.publisher.getAvailability({ reportId, userId })).resolves.toMatchObject({
    configured: false,
    migrationReady: false,
    eligible: false,
    reason: 'credentials_missing',
  });
  const migrationMissing = createHarness({ migrationError: true });
  await expect(migrationMissing.publisher.getAvailability({ reportId, userId })).resolves.toMatchObject({
    configured: true,
    migrationReady: false,
    eligible: false,
    reason: 'migration_unavailable',
  });
});

test('uploads owned photo bytes and creates the expected image embed with alt text', async () => {
  const imageUrl = `https://civic.supabase.co/storage/v1/object/public/issue-photos/${userId}/issues/evidence.jpg`;
  const photoReport = { ...report, photos: [imageUrl] };
  const fetchImpl = jest.fn().mockResolvedValue(imageResponse());
  const { publisher, agent } = createHarness({ issue: photoReport, fetchImpl });
  await publisher.publishIssue({ reportId, userId });
  expect(fetchImpl).toHaveBeenCalledWith(imageUrl, expect.objectContaining({ redirect: 'error' }));
  expect(agent.uploadBlob).toHaveBeenCalledWith(expect.any(Buffer), { encoding: 'image/jpeg' });
  expect(agent.post).toHaveBeenCalledWith(expect.objectContaining({
    embed: {
      $type: 'app.bsky.embed.images',
      images: [{
        alt: 'Evidence photo for civic issue: Overflowing roadside waste',
        image: { ref: { $link: 'blob-cid' }, mimeType: 'image/jpeg', size: 2 },
      }],
    },
  }));
});

test('re-encodes photo pixels as JPEG without copying embedded metadata', async () => {
  const pipeline = {
    rotate: jest.fn(),
    resize: jest.fn(),
    flatten: jest.fn(),
    jpeg: jest.fn(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('sanitized-jpeg')),
  };
  for (const method of ['rotate', 'resize', 'flatten', 'jpeg']) pipeline[method].mockReturnValue(pipeline);
  const sharpMock = jest.fn().mockReturnValue(pipeline);
  const publicImage = await sanitizePhoto(Buffer.from('fixture-image'), sharpMock);
  expect(publicImage).toEqual(Buffer.from('sanitized-jpeg'));
  expect(sharpMock).toHaveBeenCalledWith(Buffer.from('fixture-image'), {
    limitInputPixels: 40_000_000,
    failOn: 'error',
  });
  expect(pipeline.rotate).toHaveBeenCalledTimes(1);
  expect(pipeline.flatten).toHaveBeenCalledWith({ background: '#ffffff' });
  expect(pipeline.jpeg).toHaveBeenCalledWith({ quality: 82, mozjpeg: true });
});

test('signs private owned photo references server-side without publishing the signed URL', async () => {
  const imageReference = `supabase-storage://private-issue-photos/${userId}/issues/evidence.jpg`;
  const fetchImpl = jest.fn().mockResolvedValue(imageResponse());
  const { publisher, agent, adminRequestImpl } = createHarness({
    issue: { ...report, photos: [imageReference] },
    fetchImpl,
  });
  await publisher.publishIssue({ reportId, userId });
  expect(adminRequestImpl).toHaveBeenCalledWith(
    expect.stringContaining('/storage/v1/object/sign/private-issue-photos/'),
    expect.objectContaining({ method: 'POST' })
  );
  expect(fetchImpl.mock.calls[0][0]).toContain('token=private');
  expect(JSON.stringify(agent.post.mock.calls[0])).not.toContain('token=private');
});

test('requires both server credentials without exposing their values', async () => {
  const { publisher, adminRequestImpl } = createHarness({ credentials: false });
  await expect(publisher.publishIssue({ reportId, userId })).rejects.toMatchObject({
    status: 503,
    message: expect.stringContaining('BLUESKY_IDENTIFIER and BLUESKY_APP_PASSWORD'),
  });
  expect(adminRequestImpl).not.toHaveBeenCalled();
});

test('rejects malformed report IDs and reports not owned by the authenticated user', async () => {
  const invalid = createHarness();
  await expect(invalid.publisher.publishIssue({ reportId: 'not-a-uuid', userId })).rejects.toMatchObject({ status: 400 });
  const unauthorized = createHarness({ issue: null });
  await expect(unauthorized.publisher.publishIssue({ reportId, userId })).rejects.toMatchObject({ status: 404 });
});

test.each([
  [{ ...report, privacy: 'none', visibility: 'private' }, 403],
  [{ ...report, flagged: true }, 403],
  [{ ...report, moderation_status: 'hidden' }, 403],
  [{ ...report, title: 'Short' }, 422],
])('blocks reports that are not eligible for public publication', async (issue, status) => {
  const { publisher, agent } = createHarness({ issue });
  await expect(publisher.publishIssue({ reportId, userId })).rejects.toMatchObject({ status });
  expect(agent.post).not.toHaveBeenCalled();
});

test('fails safely when an authorized report photo cannot be retrieved', async () => {
  const imageUrl = `supabase-storage://private-issue-photos/${userId}/issues/evidence.jpg`;
  const fetchImpl = jest.fn().mockRejectedValue(new Error('private URL and token'));
  const { publisher, agent, publications } = createHarness({
    issue: { ...report, photos: [imageUrl] },
    fetchImpl,
  });
  let thrown;
  try {
    await publisher.publishIssue({ reportId, userId });
  } catch (error) {
    thrown = error;
  }
  expect(thrown.status).toBe(503);
  expect(thrown.message).toBe('The report photo is unavailable from Civic Vigilance storage.');
  expect(agent.post).not.toHaveBeenCalled();
  expect(publications.get(reportId).status).toBe('failed');
});

test.each([
  [401, /rejected the configured app password/],
  [403, /rejected the configured app password/],
  [400, /rejected this report/],
  [404, /account or service could not be found/],
  [429, /rate-limiting/],
])('maps provider HTTP %i errors to safe actionable messages', async (status, expected) => {
  const { publisher, publications } = createHarness({
    agentOverrides: { post: jest.fn().mockRejectedValue(Object.assign(new Error('raw provider body secret'), { status })) },
  });
  let thrown;
  try {
    await publisher.publishIssue({ reportId, userId });
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toMatchObject({ message: expect.stringMatching(expected) });
  expect(thrown.message).not.toContain('raw provider body secret');
  expect(publications.get(reportId).status).toBe('failed');
});

test('marks uncertain post outcomes and blocks a retry that could duplicate a post', async () => {
  const post = jest.fn().mockRejectedValue(new Error('socket timeout'));
  const { publisher, agent, publications } = createHarness({ agentOverrides: { post } });
  await expect(publisher.publishIssue({ reportId, userId })).rejects.toMatchObject({
    status: 503,
    message: expect.stringContaining('Check the official account'),
  });
  expect(publications.get(reportId).status).toBe('uncertain');
  await expect(publisher.publishIssue({ reportId, userId })).rejects.toMatchObject({ status: 409 });
  expect(agent.post).toHaveBeenCalledTimes(1);
});

test('marks provider server errors as uncertain and prevents an automatic duplicate', async () => {
  const post = jest.fn().mockRejectedValue(Object.assign(new Error('untrusted provider body'), { status: 503 }));
  const { publisher, agent, publications } = createHarness({ agentOverrides: { post } });
  await expect(publisher.publishIssue({ reportId, userId })).rejects.toThrow(/Check the official account/);
  expect(publications.get(reportId).status).toBe('uncertain');
  await expect(publisher.publishIssue({ reportId, userId })).rejects.toMatchObject({ status: 409 });
  expect(agent.post).toHaveBeenCalledTimes(1);
});

test('rejects oversized and unsupported report photos before uploading', async () => {
  const imageUrl = `https://civic.supabase.co/storage/v1/object/public/issue-photos/${userId}/issues/evidence.jpg`;
  const tooLarge = createHarness({
    issue: { ...report, photos: [imageUrl] },
    fetchImpl: jest.fn().mockResolvedValue({
      ...imageResponse(),
      headers: { get: (name) => (name === 'content-type' ? 'image/jpeg' : String(10 * 1024 * 1024 + 1)) },
    }),
  });
  await expect(tooLarge.publisher.publishIssue({ reportId, userId })).rejects.toMatchObject({ status: 413 });
  expect(tooLarge.agent.uploadBlob).not.toHaveBeenCalled();
  const unsupported = createHarness({
    issue: { ...report, photos: [imageUrl] },
    fetchImpl: jest.fn().mockResolvedValue(imageResponse('image/gif')),
  });
  await expect(unsupported.publisher.publishIssue({ reportId, userId })).rejects.toMatchObject({ status: 415 });
  expect(unsupported.agent.uploadBlob).not.toHaveBeenCalled();
});

test('returns the existing link without creating a duplicate post', async () => {
  const { publisher, agent } = createHarness();
  const first = await publisher.publishIssue({ reportId, userId });
  const second = await publisher.publishIssue({ reportId, userId });
  expect(second).toEqual({
    status: 'published',
    alreadyPublished: true,
    postUrl: first.postUrl,
  });
  expect(agent.post).toHaveBeenCalledTimes(1);
  await expect(publisher.getAvailability({ reportId, userId })).resolves.toMatchObject({
    alreadyPublished: true,
    postUrl: first.postUrl,
  });
});

test('limits post text and rejects photos outside the owner-scoped Supabase buckets', () => {
  expect(Array.from(formatPostText({ title: 'Title', description: 'x'.repeat(1000) })).length).toBeLessThanOrEqual(300);
  expect(safePhotoReference(
    'https://attacker.example/storage/v1/object/public/issue-photos/22222222-2222-4222-8222-222222222222/issues/photo.jpg',
    userId,
    new URL('https://civic.supabase.co')
  )).toBeNull();
});

test('removes contact details, exact street addresses, coordinates, links, and control chars', () => {
  const result = sanitizePublicText(
    'Waste at 123 Main Street. Contact civic@example.org or 555-123-4567. 40.7128, -74.0060 https://example.org\u0000'
  );
  expect(result).not.toMatch(/123 Main Street|civic@example\.org|555-123-4567|40\.7128|https:\/\/example\.org/);
  expect(result).toContain('[address removed]');
  expect(result.match(/\[contact removed\]/g)).toHaveLength(2);
  expect(result).toContain('[location removed]');
  expect(result).toContain('[link removed]');
  expect(result).not.toContain('\u0000');
});
