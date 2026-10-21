const { analyzeImage } = require('../src/ai-analysis');
const { generateReportContent } = require('../src/report-content');

const imageAnalysis = {
  issue_category: 'pothole',
  description: 'A broken road surface is visible.',
  visible_evidence: ['Broken asphalt'],
  confidence: 0.9,
  needs_review: false,
  uncertainties: [],
};

const generatedContent = {
  title: 'Visible damage to the road surface',
  description: 'A damaged section of road surface is visible. Please inspect and address it.',
  summary: 'Visible road surface damage.',
  awareness_caption: 'Please review this reported road issue.',
  hashtags: ['#CivicVigilance'],
  category_suggestion: '',
  clarification_question: '',
};

function groqResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify({
      choices: [{ message: { content: JSON.stringify(value) } }],
    }),
  };
}

describe('Groq report-assistance adapter', () => {
  const originalKey = process.env.GROQ_API_KEY;
  const legacyKeys = [
    'AI_VISION_ENDPOINT',
    'AI_VISION_API_KEY',
    'AI_TEXT_ENDPOINT',
    'AI_TEXT_API_KEY',
  ];
  const originalLegacyValues = Object.fromEntries(legacyKeys.map((name) => [name, process.env[name]]));

  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-only-groq-key';
    for (const name of legacyKeys) delete process.env[name];
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalKey;
    for (const name of legacyKeys) {
      if (originalLegacyValues[name] === undefined) delete process.env[name];
      else process.env[name] = originalLegacyValues[name];
    }
  });

  test('sends private photo bytes as Groq image input and validates the analysis contract', async () => {
    const fakeImage = Buffer.from('test-image-bytes');
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name) => ({
            'content-type': 'image/jpeg',
            'content-length': String(fakeImage.length),
          }[name.toLowerCase()] || null),
        },
        arrayBuffer: async () => fakeImage,
      })
      .mockResolvedValueOnce(groqResponse(imageAnalysis));

    await expect(analyzeImage({
      imageUrl: 'https://storage.example.test/signed-photo',
      fetchImpl,
    })).resolves.toEqual(imageAnalysis);

    const [endpoint, request] = fetchImpl.mock.calls[1];
    expect(String(endpoint)).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(request.headers).toMatchObject({
      'content-type': 'application/json',
      authorization: 'Bearer test-only-groq-key',
    });
    const body = JSON.parse(request.body);
    expect(body.model).toBe('qwen/qwen3.8-27b');
    expect(body.messages[1].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${fakeImage.toString('base64')}` },
    });
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(request.body).not.toContain('storage.example.test');
  });

  test('generates validated report title and description from Groq JSON and normalizes optional fields', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(groqResponse(generatedContent));

    await expect(generateReportContent({
      input: { category: 'pothole', description: 'A damaged road surface is visible.' },
      imageAnalysis,
      fetchImpl,
    })).resolves.toEqual({
      ...generatedContent,
      category_suggestion: null,
      clarification_question: null,
    });

    const [endpoint, request] = fetchImpl.mock.calls[0];
    expect(String(endpoint)).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer test-only-groq-key');
    const body = JSON.parse(request.body);
    expect(body.model).toBe('qwen/qwen3.8-27b');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[1].content[0].text).toContain('"task":"civic_report_image_grounded_content"');
    expect(body.messages[1].content[0].text).toContain('"image_analysis"');
    expect(body.messages[1].content[0].text).toContain('Do not invent an exact address');
  });

  test.each([
    [400, 502, 'request format'],
    [401, 503, 'Verify GROQ_API_KEY'],
    [403, 503, 'Verify GROQ_API_KEY'],
    [404, 503, 'model is unavailable'],
    [429, 429, 'free-plan quota'],
    [500, 503, 'temporarily unavailable'],
  ])('maps Groq HTTP %i to a safe actionable error', async (providerStatus, expectedStatus, safeText) => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: providerStatus,
      text: async () => 'private-provider-error-body',
    });

    const error = await generateReportContent({
      input: { category: 'pothole', description: 'A damaged road surface is visible.' },
      fetchImpl,
    }).catch((cause) => cause);
    expect(error.status).toBe(expectedStatus);
    expect(error.safeMessage).toContain(safeText);
    expect(error.safeMessage).not.toContain('private-provider-error-body');
  });

  test('does not include provider network details or credentials in errors', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(
      new Error('connection failed; Authorization: Bearer private-provider-secret')
    );
    const error = await generateReportContent({
      input: { category: 'pothole', description: 'A damaged road surface is visible.' },
      fetchImpl,
    }).catch((cause) => cause);

    expect(error.status).toBe(503);
    expect(error.message).not.toContain('private-provider-secret');
    expect(error.safeMessage).not.toContain('private-provider-secret');
  });

  test('preserves timeout signals for the route to map to its safe retry response', async () => {
    const timeout = new Error('request timed out');
    timeout.name = 'AbortError';
    const fetchImpl = jest.fn().mockRejectedValue(timeout);
    const error = await generateReportContent({
      input: { category: 'pothole', description: 'A damaged road surface is visible.' },
      fetchImpl,
    }).catch((cause) => cause);

    expect(error.name).toBe('AbortError');
    expect(error.message).toBe('request timed out');
  });
});
