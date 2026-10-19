import AsyncStorage from '@react-native-async-storage/async-storage';

const ACTIVE_DRAFT_KEY = 'civic_vigilance_active_report_draft_v1';

export async function saveReportDraft(draft: unknown) {
  await AsyncStorage.setItem(ACTIVE_DRAFT_KEY, JSON.stringify({ draft, savedAt: new Date().toISOString() }));
}

export async function loadReportDraft<T>(): Promise<{ draft: T; savedAt: string } | null> {
  const raw = await AsyncStorage.getItem(ACTIVE_DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { draft: T; savedAt: string };
  } catch {
    await AsyncStorage.removeItem(ACTIVE_DRAFT_KEY);
    return null;
  }
}

export async function clearReportDraft() {
  await AsyncStorage.removeItem(ACTIVE_DRAFT_KEY);
}
