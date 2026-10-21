import { CategoryKey } from '../types';

export interface GeneratedReportContent {
  title: string;
  description: string;
  summary: string;
  awareness_caption: string;
  hashtags: string[];
  category_suggestion: CategoryKey | null;
  clarification_question: string | null;
}

export interface ReportContentInput {
  title: string;
  category: CategoryKey;
  description: string;
}

export interface ReportImageAnalysis {
  issue_category: CategoryKey;
  description: string;
  visible_evidence: string[];
  confidence: number;
  needs_review: boolean;
  uncertainties: string[];
}

const CATEGORIES: CategoryKey[] = [
  'pothole', 'garbage', 'streetlight', 'drainage', 'water_supply', 'sewage',
  'traffic_signal', 'encroachment', 'stray_animals', 'parks', 'other',
];

export function validateReportContentInput(
  report: ReportContentInput,
  privacyNoticeAccepted: boolean,
  hasImage = false
): ReportContentInput {
  if (!privacyNoticeAccepted) throw new Error('Accept the AI writing privacy notice before continuing.');
  if (!hasImage && (!report.description.trim() || report.description.trim().length < 10)) {
    throw new Error('Enter at least 10 characters of report details before generating content.');
  }
  if (report.title.length > 100 || report.description.length > 1000 || !CATEGORIES.includes(report.category)) {
    throw new Error('Check the report details and try again.');
  }
  return {
    title: report.title.trim(),
    category: report.category,
    description: report.description.trim(),
  };
}

export function parseReportImageAnalysis(value: unknown): ReportImageAnalysis {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The AI service returned an invalid image analysis. Continue manually.');
  }
  const analysis = value as Record<string, unknown>;
  const isStringList = (entry: unknown): entry is string[] => Array.isArray(entry)
    && entry.length <= 10
    && entry.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 300);
  const visibleEvidence = analysis.visible_evidence;
  const uncertainties = analysis.uncertainties;
  if (typeof analysis.issue_category !== 'string'
      || !CATEGORIES.includes(analysis.issue_category as CategoryKey)
      || typeof analysis.description !== 'string'
      || analysis.description.trim().length < 3
      || analysis.description.length > 1000
      || !isStringList(visibleEvidence)
      || typeof analysis.confidence !== 'number'
      || !Number.isFinite(analysis.confidence)
      || analysis.confidence < 0
      || analysis.confidence > 1
      || typeof analysis.needs_review !== 'boolean'
      || !isStringList(uncertainties)) {
    throw new Error('The AI service returned an invalid image analysis. Continue manually.');
  }
  return {
    issue_category: analysis.issue_category as CategoryKey,
    description: analysis.description.trim(),
    visible_evidence: [...visibleEvidence],
    confidence: analysis.confidence,
    needs_review: analysis.needs_review,
    uncertainties: [...uncertainties],
  };
}

export function parseReportContentResponse(value: unknown): GeneratedReportContent {
  if (!value || typeof value !== 'object' || !('content' in value)) {
    throw new Error('The AI service returned an invalid response. Continue manually.');
  }
  const content = (value as { content: unknown }).content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new Error('The AI service returned an invalid response. Continue manually.');
  }
  const result = content as Record<string, unknown>;
  const allowedFields = new Set([
    'title', 'description', 'summary', 'awareness_caption', 'hashtags', 'category_suggestion',
    'clarification_question',
  ]);
  if (Object.keys(result).some((field) => !allowedFields.has(field))) {
    throw new Error('The AI service returned an invalid response. Continue manually.');
  }
  const isText = (field: unknown, max: number) =>
    typeof field === 'string' && field.trim().length > 0 && field.length <= max;
  if (!isText(result.title, 100)
    || !isText(result.description, 500)
    || !isText(result.summary, 300)
    || !isText(result.awareness_caption, 500)
    || !Array.isArray(result.hashtags)
    || result.hashtags.length > 8
    || result.hashtags.some((tag) => typeof tag !== 'string' || !/^#[A-Za-z][A-Za-z0-9_]{0,49}$/.test(tag))
    || (result.clarification_question !== null
      && (typeof result.clarification_question !== 'string' || result.clarification_question.length > 200))
    || (result.category_suggestion !== null && !CATEGORIES.includes(result.category_suggestion as CategoryKey))) {
    throw new Error('The AI service returned an invalid response. Continue manually.');
  }

  return {
    title: (result.title as string).trim(),
    description: (result.description as string).trim(),
    summary: (result.summary as string).trim(),
    awareness_caption: (result.awareness_caption as string).trim(),
    hashtags: [...new Set(result.hashtags as string[])],
    category_suggestion: result.category_suggestion as CategoryKey | null,
    clarification_question: typeof result.clarification_question === 'string'
      ? result.clarification_question.trim()
      : null,
  };
}
