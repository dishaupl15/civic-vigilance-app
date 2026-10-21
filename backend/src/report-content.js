const ISSUE_CATEGORIES = new Set([
  'pothole', 'garbage', 'streetlight', 'drainage', 'water_supply', 'sewage',
  'traffic_signal', 'encroachment', 'stray_animals', 'parks', 'other',
]);
const { generateGroqJson, isGroqConfigured } = require('./groq');

const MAX_RESPONSE_BYTES = 32 * 1024;

function invalidProviderResponse(message) {
  const error = new Error(message);
  error.status = 502;
  return error;
}

function validateReportInput(value, options = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('Report details are required.'), { status: 400 });
  }
  if (!ISSUE_CATEGORIES.has(value.category)) {
    throw Object.assign(new Error('Choose a supported report category.'), { status: 400 });
  }
  const description = value.description === undefined ? '' : value.description;
  if (typeof description !== 'string'
      || (!options.allowEmptyDescription && description.trim().length < 10)
      || description.length > 1000) {
    throw Object.assign(new Error('Enter a description between 10 and 1000 characters, or provide an evidence photo.'), { status: 400 });
  }
  if (value.title !== undefined && (typeof value.title !== 'string' || value.title.length > 100)) {
    throw Object.assign(new Error('The report title must be 100 characters or fewer.'), { status: 400 });
  }
  return {
    category: value.category,
    title: typeof value.title === 'string' ? value.title.trim() : '',
    description: description.trim(),
  };
}

function validateGeneratedContent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidProviderResponse('AI response must be a JSON object.');
  }
  const allowedFields = new Set([
    'title', 'description', 'summary', 'awareness_caption', 'hashtags', 'category_suggestion',
    'clarification_question',
  ]);
  if (Object.keys(value).some((field) => !allowedFields.has(field))) {
    throw invalidProviderResponse('AI response contains unsupported fields.');
  }
  const stringField = (name, max) => {
    if (typeof value[name] !== 'string' || value[name].trim().length < 1 || value[name].length > max) {
      throw invalidProviderResponse(`AI response has an invalid ${name}.`);
    }
    return value[name].trim();
  };
  if (!Array.isArray(value.hashtags) || value.hashtags.length > 8
      || value.hashtags.some((tag) => typeof tag !== 'string' || !/^#[A-Za-z][A-Za-z0-9_]{0,49}$/.test(tag))) {
    throw invalidProviderResponse('AI response has invalid hashtags.');
  }
  if (typeof value.title !== 'string' || value.title.trim().length < 10) {
    throw invalidProviderResponse('AI response has an invalid title.');
  }
  if (value.category_suggestion !== null && !ISSUE_CATEGORIES.has(value.category_suggestion)) {
    throw invalidProviderResponse('AI response has an unsupported category suggestion.');
  }
  if (value.clarification_question !== null
      && (typeof value.clarification_question !== 'string' || value.clarification_question.length > 200)) {
    throw invalidProviderResponse('AI response has an invalid clarification question.');
  }
  return {
    title: stringField('title', 100),
    description: stringField('description', 500),
    summary: stringField('summary', 300),
    awareness_caption: stringField('awareness_caption', 500),
    hashtags: [...new Set(value.hashtags)].slice(0, 8),
    category_suggestion: value.category_suggestion,
    clarification_question: value.clarification_question?.trim() || null,
  };
}

async function readLimitedResponse(response) {
  const contentLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw invalidProviderResponse('AI response exceeded the allowed size.');
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
        if (totalBytes > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw invalidProviderResponse('AI response exceeded the allowed size.');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(combined);
  }
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw invalidProviderResponse('AI response exceeded the allowed size.');
  }
  return text;
}

async function generateReportContent({ input, imageAnalysis, signal, fetchImpl = fetch }) {
  const useGroq = isGroqConfigured();
  const endpoint = process.env.AI_TEXT_ENDPOINT;
  const apiKey = process.env.AI_TEXT_API_KEY;
  if (!useGroq && (!endpoint || !apiKey)) {
    const error = new Error('AI writing assistance is not configured. You can continue your report manually.');
    error.status = 503;
    throw error;
  }
  if (!useGroq) {
    let parsedEndpoint;
    try {
      parsedEndpoint = new URL(endpoint);
    } catch {
      parsedEndpoint = null;
    }
    if (!parsedEndpoint || parsedEndpoint.protocol !== 'https:' || parsedEndpoint.username || parsedEndpoint.password) {
      const error = new Error('AI writing endpoint must be a valid HTTPS URL.');
      error.status = 503;
      throw error;
    }
  }

  const report = validateReportInput(input, { allowEmptyDescription: Boolean(imageAnalysis) });
  if (imageAnalysis && (
    typeof imageAnalysis.issue_category !== 'string'
    || !ISSUE_CATEGORIES.has(imageAnalysis.issue_category)
    || typeof imageAnalysis.description !== 'string'
    || !Array.isArray(imageAnalysis.visible_evidence)
    || typeof imageAnalysis.confidence !== 'number'
    || typeof imageAnalysis.needs_review !== 'boolean'
    || !Array.isArray(imageAnalysis.uncertainties)
  )) {
    throw Object.assign(new Error('Image analysis is incomplete. Continue manually or retry.'), { status: 502 });
  }
  const request = {
    task: imageAnalysis ? 'civic_report_image_grounded_content' : 'civic_report_content',
    report,
    ...(imageAnalysis ? { image_analysis: imageAnalysis } : {}),
    instructions: [
      'Return only the requested JSON object.',
      imageAnalysis
        ? 'Ground the suggested title and description in the supplied image_analysis and the citizen-provided report fields. The analysis distinguishes visible evidence from uncertainty; preserve that uncertainty.'
        : 'Use only the supplied report title, category, and description.',
      'Treat the supplied category as the citizen’s current selection, not as proof of what the photo contains. Suggest a different category only when supported by visible evidence.',
      'Do not invent facts, evidence, dates, exact locations, impacts, injuries, duration, causes, blame, or official statements.',
      'Use plain, natural English. Keep the title specific and concise, usually 6–14 words, without clickbait or excessive capitalization.',
      'Write a useful, respectful complaint description, generally 60–90 words when evidence permits and always within 500 characters. Describe visible conditions and surroundings, mention possible inconvenience only when reasonably supported, and ask the appropriate civic team to inspect and address the issue.',
      'Preserve uncertainty and the user’s intended meaning. Do not strengthen allegations.',
      'If information is insufficient, avoid guessing and ask the user to add details in the description.',
      'The awareness caption is a separate optional draft, not the submitted report description.',
      'Do not recommend or identify people, officials, authorities, handles, or contact information.',
    ].join(' '),
    response_schema: {
      title: 'string (10-100 characters)',
      description: 'string (10-500 characters)',
      summary: 'string (1-300 characters)',
      awareness_caption: 'string (1-500 characters)',
      hashtags: 'string[] (0-8 tags)',
      category_suggestion: 'supported category or null',
      clarification_question: 'string (1-200 characters) if essential report information is missing, otherwise null',
    },
  };

  if (useGroq) {
    const categories = [...ISSUE_CATEGORIES];
    const schema = {
      title: 'string, 10-100 characters, concise and grounded in supplied details and photo analysis',
      description: 'string, 10-500 characters, factual, describe only visible evidence and citizen-provided details',
      summary: 'string, 1-300 characters',
      awareness_caption: 'string, 1-500 characters',
      hashtags: 'string array, at most 8 strings each beginning with #',
      category_suggestion: `one supported category (${categories.join(', ')}) or null`,
      clarification_question: 'string up to 200 characters or null',
    };
    const generated = await generateGroqJson({
      signal,
      fetchImpl,
      prompt: [
        `Generate report content from this input: ${JSON.stringify(request)}.`,
        `Return a JSON object matching this contract: ${JSON.stringify(schema)}.`,
        'Populate both title and description with useful, clear content. Base them on the image_analysis and citizen-provided title, category, and description.',
        'Describe visible conditions accurately. Do not invent an exact address, location, cause, responsible person, date, impacts, injuries, duration, blame, or facts not confirmed by the image or user-provided report.',
        'If evidence is uncertain, preserve that uncertainty. Use plain, respectful English and ask the appropriate civic team to inspect the visible issue.',
        'Use null for category_suggestion when no supported change is needed and null for clarification_question unless essential information is missing.',
      ].join(' '),
    });
    if (generated && typeof generated === 'object' && !Array.isArray(generated)) {
      if (generated.category_suggestion === '') generated.category_suggestion = null;
      if (generated.clarification_question === '') generated.clarification_question = null;
    }
    return validateGeneratedContent(generated);
  }

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    const unavailable = new Error('AI writing service is unavailable. Continue manually or retry.');
    unavailable.status = 503;
    throw unavailable;
  }

  if (response.status === 429) {
    const error = new Error('AI writing limit reached. Try again later or continue manually.');
    error.status = 429;
    throw error;
  }
  if (!response.ok) {
    const error = new Error('AI writing service is unavailable. Continue manually or retry.');
    error.status = 503;
    throw error;
  }

  const text = await readLimitedResponse(response);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw invalidProviderResponse('AI response was not valid JSON.');
  }
  return validateGeneratedContent(parsed);
}

module.exports = {
  ISSUE_CATEGORIES,
  generateReportContent,
  readLimitedResponse,
  validateGeneratedContent,
  validateReportInput,
};
