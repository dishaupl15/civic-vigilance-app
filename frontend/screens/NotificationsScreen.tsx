import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Colors, Spacing, Typography } from '../constants/DesignSystem';
import { useAuth } from '../hooks/useAuth';
import { getBackend } from '../lib/backend';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { saveProfile } from '../lib/profile';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

const DEFAULT_PREFERENCES = {
  nearby: true,
  comments: true,
  upvotes: true,
  replies: true,
  twitter: false,
  digest: true,
  trending: false,
  similar: true,
};

const PREFERENCE_ROWS: { key: keyof typeof DEFAULT_PREFERENCES; label: string }[] = [
  { key: 'comments', label: 'Comments on my reports' },
  { key: 'replies', label: 'Replies to my comments' },
  { key: 'upvotes', label: 'Upvotes on my reports' },
  { key: 'nearby', label: 'Nearby issues' },
  { key: 'trending', label: 'Trending issues' },
  { key: 'similar', label: 'Similar issues' },
  { key: 'digest', label: 'Weekly digest' },
  { key: 'twitter', label: 'X/Twitter engagement' },
];

export default function NotificationsScreen() {
  const { profile, refreshProfile, isGuest } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [preferenceError, setPreferenceError] = useState('');
  const [savingPreference, setSavingPreference] = useState<keyof typeof DEFAULT_PREFERENCES | null>(null);

  const userId = profile?.uid;
  const notificationsAvailable = getBackend() === 'supabase' && isSupabaseConfigured && !!userId && !isGuest;

  const loadNotifications = async (isRefresh = false) => {
    if (!notificationsAvailable || !userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase
        .from('notifications')
        .select('id,type,title,body,read,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (queryError) throw queryError;
      setItems((data || []) as NotificationRow[]);
    } catch {
      setError('Could not load notifications. Check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, [userId, isGuest, notificationsAvailable]);

  const markRead = async (item: NotificationRow) => {
    if (item.read || !userId) return;
    setError('');
    const { error: updateError } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', item.id)
      .eq('user_id', userId);
    if (updateError) {
      setError('Could not mark this notification as read. Please retry.');
      return;
    }
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry));
  };

  const updatePreference = async (key: keyof typeof DEFAULT_PREFERENCES, value: boolean) => {
    if (!profile?.uid) return;
    const current = profile.preferences?.notifications || DEFAULT_PREFERENCES;
    setSavingPreference(key);
    setPreferenceError('');
    try {
      await saveProfile({
        id: profile.uid,
        preferences: { ...profile.preferences, notifications: { ...current, [key]: value } },
      } as any);
      await refreshProfile();
    } catch {
      setPreferenceError('Notification preference could not be saved. Please retry.');
    } finally {
      setSavingPreference(null);
    }
  };

  const preferences = profile?.preferences?.notifications || DEFAULT_PREFERENCES;
  const unreadCount = items.filter((item) => !item.read).length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={(
        <RefreshControl refreshing={refreshing} onRefresh={() => { void loadNotifications(true); }} />
      )}
    >
      <Text style={styles.title}>Notifications</Text>
      <Text style={styles.subtitle}>{unreadCount ? `${unreadCount} unread` : 'Your latest account activity'}</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator accessibilityLabel="Loading notifications" color={Colors.primary} style={styles.loader} />
      ) : !notificationsAvailable ? (
        <Text style={styles.empty}>Sign in to an online account to view notifications.</Text>
      ) : items.length === 0 ? (
        <Text style={styles.empty}>You’re all caught up. New account notifications will appear here.</Text>
      ) : items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityState={{ selected: !item.read }}
          onPress={() => { void markRead(item); }}
          style={[styles.notification, !item.read && styles.unread]}
        >
          <View style={styles.notificationHeader}>
            <Text style={styles.notificationTitle}>{item.title}</Text>
            {!item.read && <View style={styles.unreadDot} />}
          </View>
          <Text style={styles.body}>{item.body}</Text>
          <Text style={styles.date}>{new Date(item.created_at).toLocaleString()}</Text>
        </Pressable>
      ))}

      <Text style={styles.sectionTitle}>Preferences</Text>
      {PREFERENCE_ROWS.map(({ key, label }) => (
        <View key={key} style={styles.preferenceRow}>
          <Text style={styles.preferenceLabel}>{label}</Text>
          <Switch
            value={preferences[key]}
            disabled={savingPreference !== null}
            onValueChange={(value) => { void updatePreference(key, value); }}
          />
        </View>
      ))}
      {preferenceError ? <Text accessibilityRole="alert" style={styles.error}>{preferenceError}</Text> : null}
      {savingPreference ? <Text style={styles.saving}>Saving preference…</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 40 },
  title: { ...Typography.h3, color: Colors.textMain, marginBottom: 4 },
  subtitle: { ...Typography.caption, color: Colors.textMuted, marginBottom: Spacing.md },
  loader: { marginVertical: Spacing.lg },
  empty: { ...Typography.bodySm, color: Colors.textSecondary, paddingVertical: Spacing.lg },
  notification: { padding: Spacing.md, marginBottom: Spacing.sm, backgroundColor: Colors.surface, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  unread: { borderColor: Colors.primary, backgroundColor: Colors.surfaceHighlight },
  notificationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notificationTitle: { ...Typography.bodySm, color: Colors.textMain, fontWeight: '700', flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginLeft: 8 },
  body: { ...Typography.bodySm, color: Colors.textSecondary, marginTop: 6 },
  date: { ...Typography.caption, color: Colors.textMuted, marginTop: 8 },
  sectionTitle: { ...Typography.h4, color: Colors.textMain, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  preferenceRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.border },
  preferenceLabel: { ...Typography.bodySm, color: Colors.textMain, flex: 1 },
  error: { ...Typography.caption, color: Colors.error, marginVertical: Spacing.sm },
  saving: { ...Typography.caption, color: Colors.textMuted, marginTop: Spacing.sm },
});

