/**
 * Storage Service - Supabase Storage for Photo Uploads
 *
 * Handles uploading photos to Supabase Storage bucket
 * for issue reports and user profiles.
 *
 * Features:
 * - Image compression (60-80% size reduction)
 * - Parallel uploads for speed
 * - Automatic retry on failure
 * - Progress tracking
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { getBackend } from './backend';
import { optimizeImage, needsOptimization } from './imageOptimizer';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const STORAGE_BUCKET = process.env.EXPO_PUBLIC_STORAGE_BUCKET || 'issue-photos';
const PRIVATE_STORAGE_BUCKET = process.env.EXPO_PUBLIC_PRIVATE_STORAGE_BUCKET || 'private-issue-photos';
const STORAGE_REFERENCE_PREFIX = 'supabase-storage://';

/** Exponential backoff retry helper */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = MAX_RETRIES): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        if (__DEV__) console.log(`[Storage] Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Upload a photo to Supabase Storage with optimization
 *
 * @param uri - Local file URI from the camera or gallery
 * @param folder - Storage folder (e.g., 'issues', 'profiles')
 * @param optimize - Whether to compress image before upload (default: true)
 * @returns Public URL of the uploaded photo
 */
export async function uploadPhoto(
  uri: string,
  folder: string = 'issues',
  optimize: boolean = true,
  stableKey?: string,
  isPrivate: boolean = false
): Promise<string> {
  if (getBackend() !== 'supabase' || !isSupabaseConfigured) {
    // For SQLite backend, just return the local URI
    if (__DEV__) console.log('[Storage] Using local URI for SQLite backend');
    return uri;
  }

  const startTime = Date.now();

  try {
    let uploadUri = uri;

    // Optimize image before upload for faster speeds
    if (optimize && await needsOptimization(uri)) {
      if (__DEV__) console.log('[Storage] Compressing image...');
      const optimized = await optimizeImage(uri, {
        maxWidth: 1920,
        maxHeight: 1920,
        quality: 0.85,  // High quality for evidence photos
        format: 'jpeg',
      });
      uploadUri = optimized.uri;
      if (__DEV__) console.log(`[Storage] Optimized image size: ${optimized.size} bytes`);
    }

    // Convert local URI to blob for upload
    const response = await fetch(uploadUri);
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('Only image uploads are supported.');
    if (blob.size <= 0 || blob.size > MAX_UPLOAD_BYTES) throw new Error('Photo must be between 1 byte and 10 MB after compression.');

    // Generate unique filename
    const fileExt = 'jpg'; // Always use jpg after optimization
    const safeKey = stableKey?.replace(/[^a-zA-Z0-9_-]/g, '') || Crypto.randomUUID();
    const fileName = `${safeKey}.${fileExt}`;
    const { data: authData } = await supabase.auth.getSession();
    const userId = authData?.session?.user?.id;
    if (!userId) throw new Error('Sign in before uploading report evidence.');
    const filePath = `${userId}/${folder}/${fileName}`;
    const bucket = isPrivate ? PRIVATE_STORAGE_BUCKET : STORAGE_BUCKET;

    if (__DEV__) console.log('[Storage] Uploading to Supabase Storage...');

    // Upload to Supabase Storage with retry
    const publicUrl = await withRetry(async () => {
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: Boolean(stableKey),
        });

      if (error) {
        throw new Error(`Failed to upload photo: ${error.message}`);
      }

      if (isPrivate) {
        // Persist an object reference, never a signed URL that will expire.
        return `${STORAGE_REFERENCE_PREFIX}${bucket}/${data.path}`;
      }

      // Public reports can persist the stable public object URL.
      const { data: { publicUrl: url } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      return url;
    });

    const uploadTime = Date.now() - startTime;
    if (!/^https:\/\//i.test(publicUrl) && !publicUrl.startsWith(STORAGE_REFERENCE_PREFIX)) {
      throw new Error('Storage did not return a valid photo reference.');
    }
    if (__DEV__) console.log(`[Storage] Upload complete in ${uploadTime}ms`);
    if (uploadUri !== uri && uploadUri.startsWith('file:')) {
      await FileSystem.deleteAsync(uploadUri, { idempotent: true }).catch(() => undefined);
    }
    return publicUrl;
  } catch (error: any) {
    console.error('[Storage] Upload failed after retries:', error);
    throw new Error(error?.message || 'Photo upload failed. Your draft has been preserved.');
  }
}

/**
 * Upload multiple photos in parallel for maximum speed
 *
 * @param uris - Array of local file URIs
 * @param folder - Storage folder
 * @param optimize - Whether to compress images (default: true)
 * @returns Array of public URLs
 */
export async function uploadPhotos(
  uris: string[],
  folder: string = 'issues',
  optimize: boolean = true,
  requestId?: string,
  isPrivate: boolean = false
): Promise<string[]> {
  if (__DEV__) console.log(`[Storage] Uploading ${uris.length} photos in parallel...`);

  const startTime = Date.now();

  if (uris.length === 0 || uris.length > 3) throw new Error('Choose between one and three photos.');
  const urls: string[] = [];
  for (let index = 0; index < uris.length; index += 2) {
    const batch = uris.slice(index, index + 2);
    urls.push(...await Promise.all(batch.map((uri, batchIndex) => {
      const absoluteIndex = index + batchIndex;
      return uploadPhoto(uri, folder, optimize, requestId ? `${requestId}-${absoluteIndex}` : undefined, isPrivate);
    })));
  }

  const totalTime = Date.now() - startTime;
  const avgTime = (totalTime / uris.length).toFixed(0);

  if (__DEV__) {
    console.log(`[Storage] Batch upload complete in ${totalTime}ms (${avgTime}ms/photo)`);
    console.log(`[Storage] Successfully uploaded ${urls.length} photos`);
  }
  return urls;
}

/** Resolve a persisted private object reference to a short-lived display URL. */
export async function resolvePhotoUrl(reference: string): Promise<string> {
  if (!reference.startsWith(STORAGE_REFERENCE_PREFIX)) return reference;
  if (getBackend() !== 'supabase' || !isSupabaseConfigured) return reference;

  const value = reference.slice(STORAGE_REFERENCE_PREFIX.length);
  const separator = value.indexOf('/');
  if (separator <= 0 || separator === value.length - 1) throw new Error('Invalid storage photo reference.');
  const bucket = value.slice(0, separator);
  const path = value.slice(separator + 1);
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not authorize private photo access.');
  return data.signedUrl;
}

export async function resolvePhotoUrls(references: string[]): Promise<string[]> {
  return Promise.all(references.map(resolvePhotoUrl));
}

/**
 * Delete a photo from Supabase Storage
 *
 * @param url - Public URL of the photo to delete
 */
export async function deletePhoto(url: string): Promise<void> {
  if (getBackend() !== 'supabase' || !isSupabaseConfigured) {
    return;
  }

  try {
    let bucket = STORAGE_BUCKET;
    let filePath = '';
    if (url.startsWith(STORAGE_REFERENCE_PREFIX)) {
      const value = url.slice(STORAGE_REFERENCE_PREFIX.length);
      const separator = value.indexOf('/');
      bucket = value.slice(0, separator);
      filePath = value.slice(separator + 1);
    } else {
      const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
      const markerIndex = url.indexOf(marker);
      if (markerIndex >= 0) filePath = decodeURIComponent(url.slice(markerIndex + marker.length));
    }
    if (!bucket || !filePath) throw new Error('Invalid storage photo reference.');

    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath]);

    if (error) {
      console.error('[Storage] Delete error:', error);
    } else {
      if (__DEV__) console.log('[Storage] Photo deleted successfully:', filePath);
    }
  } catch (error) {
    console.error('[Storage] Delete failed:', error);
  }
}
