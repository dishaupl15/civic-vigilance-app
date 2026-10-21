type SupabaseErrorDetails = {
  code?: unknown;
  message?: unknown;
};

export function formatSupabaseError(error: unknown, fallback: string): string {
  let code: string | undefined;
  let message: string | undefined;
  if (typeof error === 'object' && error !== null) {
    const details = error as SupabaseErrorDetails;
    if (typeof details.code === 'string') code = details.code;
    if (typeof details.message === 'string') message = details.message;
  } else if (error instanceof Error) {
    message = error.message;
  }

  if (__DEV__) console.warn('[Supabase] Request failed', { code, message });
  if (code === 'PGRST205') return `${fallback} The data service is unavailable. Please try again.`;
  return `${fallback} Please try again.`;
}
