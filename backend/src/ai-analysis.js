const ISSUE_CATEGORIES = new Set([
  'pothole', 'garbage', 'streetlight', 'drainage', 'water_supply', 'sewage',
  'traffic_signal', 'encroachment', 'stray_animals', 'parks', 'other',
]);

function validateAnalysis(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI response must be an object');
  if (!ISSUE_CATEGORIES.has(value.issue_category)) throw new Error('AI response has an unsupported category');
  if (typeof value.description !== 'string' || value.description.trim().length < 3 || value.description.length > 1000) throw new Error('AI response has an invalid description');
  if (!Array.isArray(value.visible_evidence) || value.visible_evidence.some((item) => typeof item !== 'string')) throw new Error('AI response has invalid visible evidence');
  if (typeof value.confidence !== 'number' || value.confidence < 0 || value.confidence > 1) throw new Error('AI response has invalid confidence');
  if (typeof value.needs_review !== 'boolean' || !Array.isArray(value.uncertainties) || value.uncertainties.some((item) => typeof item !== 'string')) throw new Error('AI response has invalid review metadata');
  return {
    issue_category: value.issue_category,
    description: value.description.trim(),
    visible_evidence: value.visible_evidence.slice(0, 10),
    confidence: value.confidence,
    needs_review: value.needs_review || value.confidence < 0.65,
    uncertainties: value.uncertainties.slice(0, 10),
  };
}

async function analyzeImage({ imageUrl, signal }) {
  const endpoint = process.env.AI_VISION_ENDPOINT;
  const apiKey = process.env.AI_VISION_API_KEY;
  if (!endpoint || !apiKey) {
    const error = new Error('Image analysis is not configured. Continue with manual reporting.');
    error.status = 503;
    throw error;
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      image_url: imageUrl,
      categories: [...ISSUE_CATEGORIES],
      instructions: 'Describe only visible evidence. Do not infer location, measurements, causes, ownership, liability, accidents, or responsible authorities. Return uncertain output for blurry, irrelevant, or ambiguous images.',
      response_fields: ['issue_category', 'description', 'visible_evidence', 'confidence', 'needs_review', 'uncertainties'],
    }),
    signal,
  });
  if (response.status === 429) {
    const error = new Error('Image analysis rate limit reached. Try later or continue manually.');
    error.status = 429;
    throw error;
  }
  if (!response.ok) throw new Error('Image analysis provider is unavailable. Continue manually.');
  return validateAnalysis(await response.json());
}

module.exports = { ISSUE_CATEGORIES, validateAnalysis, analyzeImage };
