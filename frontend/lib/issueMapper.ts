import { Comment, IssueCategory, IssueWithUserData, PostingStatus, TwitterPostingMethod } from '../types';
import { resolvePhotoUrls } from './storage';

type Row = Record<string, unknown>;

const issueCategories = new Set<string>([
  'pothole', 'garbage', 'streetlight', 'drainage', 'water_supply', 'sewage',
  'traffic_signal', 'encroachment', 'stray_animals', 'parks', 'other',
]);
const postingStatuses = new Set<string>(['pending', 'posted', 'failed']);

export function isIssueCategory(value: unknown): value is IssueCategory {
  return typeof value === 'string' && issueCategories.has(value);
}

function isPostingStatus(value: unknown): value is PostingStatus {
  return typeof value === 'string' && postingStatuses.has(value);
}

function asRow(value: unknown): Row | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Row
    : undefined;
}

function requiredString(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`The response is missing a valid ${key} field.`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function metricRow(value: unknown): Row | undefined {
  if (Array.isArray(value)) return asRow(value[0]);
  return asRow(value);
}

function parsePhotos(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    if (!value.every((photo): photo is string => typeof photo === 'string')) {
      throw new Error('The report photo list contains an invalid value.');
    }
    return value;
  }
  if (typeof value === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error('The report photo list is not valid JSON.');
    }
    if (Array.isArray(parsed) && parsed.every((photo): photo is string => typeof photo === 'string')) {
      return parsed;
    }
  }
  throw new Error('The report photo list is not valid.');
}

function pointCoordinates(value: unknown): { lat?: number; lng?: number } {
  const point = asRow(value);
  if (point?.type === 'Point' && Array.isArray(point.coordinates)) {
    return {
      lng: optionalNumber(point.coordinates[0]),
      lat: optionalNumber(point.coordinates[1]),
    };
  }
  if (typeof value === 'string') {
    const match = value.match(/^POINT\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i);
    if (match) return { lng: Number(match[1]), lat: Number(match[2]) };
  }
  return {};
}

function mapPrivacy(value: unknown): TwitterPostingMethod | undefined {
  if (value === 'none') return 'none';
  if (value === 'personal' || value === 'civic_vigilance') return 'twitter';
  return undefined;
}

function parseDatabaseIssue(rowValue: unknown): IssueWithUserData {
  const row = asRow(rowValue);
  if (!row) throw new Error('The report response is not a valid database row.');

  const category = requiredString(row, 'category');
  const status = requiredString(row, 'status');
  const moderationStatus = requiredString(row, 'moderation_status');
  if (!isIssueCategory(category)) throw new Error('The report has an unsupported category.');
  if (!isPostingStatus(status)) throw new Error('The report has an unsupported posting status.');
  if (moderationStatus !== 'active' && moderationStatus !== 'hidden' && moderationStatus !== 'removed') {
    throw new Error('The report has an unsupported moderation status.');
  }

  const photos = parsePhotos(row.photos);
  const metricsRow = metricRow(row.issue_metrics);
  const metrics = metricsRow ? {
    upvotes: optionalNumber(metricsRow.upvotes),
    downvotes: optionalNumber(metricsRow.downvotes),
    comments: optionalNumber(metricsRow.comments),
    shares: optionalNumber(metricsRow.shares),
    twitterImpressions: optionalNumber(metricsRow.twitter_impressions),
  } : undefined;
  const coordinates = pointCoordinates(row.location);
  const address = optionalString(row.address);
  const geohash = optionalString(row.geohash);
  const locationSource = row.location_source === 'gps' || row.location_source === 'manual'
    ? row.location_source
    : undefined;

  return {
    id: requiredString(row, 'id'),
    userId: requiredString(row, 'user_id'),
    title: requiredString(row, 'title'),
    description: optionalString(row.description),
    category,
    photos,
    location: address || geohash || coordinates.lat !== undefined || coordinates.lng !== undefined
      ? { ...coordinates, address, geohash }
      : undefined,
    locationAccuracyM: optionalNumber(row.location_accuracy_m),
    locationSource,
    locationConfirmed: typeof row.location_confirmed === 'boolean' ? row.location_confirmed : undefined,
    address,
    ...coordinates,
    privacy: mapPrivacy(row.privacy),
    authorities: Array.isArray(row.authorities)
      ? row.authorities.filter((authority): authority is string => typeof authority === 'string')
      : undefined,
    tweetId: optionalString(row.tweet_id),
    tweetUrl: optionalString(row.tweet_url),
    status,
    anonymousUsername: optionalString(row.anonymous_username),
    metrics,
    moderation: {
      flagged: row.flagged === true,
      reviewed: row.reviewed === true,
      status: moderationStatus,
    },
    createdAt: requiredString(row, 'created_at'),
    updatedAt: optionalString(row.updated_at),
    imageUrl: photos[0],
    upvotes: metrics?.upvotes,
    downvotes: metrics?.downvotes,
    commentsCount: metrics?.comments,
    shares: metrics?.shares,
  };
}

export async function mapDatabaseIssueRow(row: unknown): Promise<IssueWithUserData> {
  const issue = parseDatabaseIssue(row);
  const photos = await resolvePhotoUrls(issue.photos);
  return { ...issue, photos, imageUrl: photos[0] };
}

export function mapLocalIssueRow(rowValue: unknown): IssueWithUserData {
  const row = asRow(rowValue);
  if (!row) throw new Error('The local report response is not a valid row.');
  const category = requiredString(row, 'category');
  if (!isIssueCategory(category)) throw new Error('The local report has an unsupported category.');

  const imageUrl = optionalString(row.image_url);
  const photos = parsePhotos(row.photos);
  const address = optionalString(row.address);
  const lat = optionalNumber(row.lat);
  const lng = optionalNumber(row.lng);
  const upvotes = optionalNumber(row.upvotes);
  const downvotes = optionalNumber(row.downvotes);
  const rawStatus = optionalString(row.status);
  const moderationStatus = row.moderation_status;
  const id = row.id;
  const userId = row.user_id;
  if ((typeof id !== 'string' && typeof id !== 'number') ||
      (typeof userId !== 'string' && typeof userId !== 'number')) {
    throw new Error('The local report is missing its identifier or owner.');
  }

  return {
    id: String(id),
    userId: String(userId),
    title: requiredString(row, 'title'),
    description: optionalString(row.description),
    category,
    photos: imageUrl ? [imageUrl] : photos,
    location: address || lat !== undefined || lng !== undefined ? { address, lat, lng } : undefined,
    address,
    lat,
    lng,
    metrics: upvotes !== undefined || downvotes !== undefined
      ? { upvotes, downvotes }
      : undefined,
    status: isPostingStatus(rawStatus) ? rawStatus : undefined,
    anonymousUsername: optionalString(row.anonymous_username),
    tweetId: optionalString(row.tweet_id),
    tweetUrl: optionalString(row.tweet_url),
    authorities: Array.isArray(row.authorities)
      ? row.authorities.filter((authority): authority is string => typeof authority === 'string')
      : typeof row.authorities === 'string'
        ? (() => {
            try {
              const authorityValue = row.authorities;
              const parsed: unknown = JSON.parse(authorityValue);
              return Array.isArray(parsed)
                ? parsed.filter((authority): authority is string => typeof authority === 'string')
                : undefined;
            } catch {
              return undefined;
            }
          })()
        : undefined,
    upvotes,
    downvotes,
    imageUrl: imageUrl ?? photos[0],
    moderation: moderationStatus === 'active' || moderationStatus === 'hidden' || moderationStatus === 'removed'
      ? {
          flagged: row.flagged === true || row.flagged === 1,
          reviewed: row.reviewed === true || row.reviewed === 1,
          status: moderationStatus,
        }
      : undefined,
    createdAt: requiredString(row, 'created_at'),
    updatedAt: optionalString(row.updated_at),
  };
}

export function mapDatabaseCommentRow(rowValue: unknown): Comment {
  const row = asRow(rowValue);
  if (!row) throw new Error('The comment response is not a valid database row.');
  const updatedAt = optionalString(row.updated_at);
  const parentId = optionalString(row.parent_id);
  return {
    id: requiredString(row, 'id'),
    reportId: requiredString(row, 'issue_id'),
    userId: requiredString(row, 'user_id'),
    content: requiredString(row, 'content'),
    parentId,
    createdAt: new Date(requiredString(row, 'created_at')),
    updatedAt: updatedAt ? new Date(updatedAt) : undefined,
    edited: row.edited === true,
  };
}

export function mapLocalCommentRow(rowValue: unknown): Comment {
  const row = asRow(rowValue);
  if (!row) throw new Error('The local comment response is not a valid row.');
  const id = row.id;
  const issueId = row.issue_id;
  const userId = row.user_id;
  if ((typeof id !== 'number' && typeof id !== 'string') ||
      (typeof issueId !== 'number' && typeof issueId !== 'string') ||
      (typeof userId !== 'number' && typeof userId !== 'string')) {
    throw new Error('The local comment is missing its identifier or owner.');
  }
  const createdAt = requiredString(row, 'created_at');
  const updatedAt = optionalString(row.updated_at);
  const parentId = typeof row.parent_id === 'number' || typeof row.parent_id === 'string'
    ? String(row.parent_id)
    : undefined;
  return {
    id: String(id),
    reportId: String(issueId),
    userId: String(userId),
    content: requiredString(row, 'content'),
    parentId,
    createdAt: new Date(createdAt),
    updatedAt: updatedAt ? new Date(updatedAt) : undefined,
    edited: row.edited === true || row.edited === 1,
    likes: optionalNumber(row.likes),
  };
}
