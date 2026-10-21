import React, { useEffect, useState } from 'react';
import { View, FlatList, StyleSheet, Text, Pressable } from 'react-native';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { IssueWithUserData } from '../types';
import { useAuth } from '../hooks/useAuth';
import { listUserIssues } from '../lib/sqliteIssues';
import { getBackend } from '../lib/backend';

import { Colors, Typography, Spacing } from '../constants/DesignSystem';
import EnhancedIssueCard from '../components/EnhancedIssueCard';
import { mapDatabaseIssueRow, mapLocalIssueRow } from '../lib/issueMapper';
import { formatSupabaseError } from '../lib/supabaseError';

export default function MyReportsScreen({ navigation }: any) {
  const { session, isGuest } = useAuth();
  const [data, setData] = useState<IssueWithUserData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!session?.user?.id || isGuest) {
        setData([]);
        setError(null);
        return;
      }

      try {
        setError(null);
      if (getBackend() === 'sqlite') {
        const all = listUserIssues(Number(session.user.id));
        if (active) setData(all.map(mapLocalIssueRow));
      } else if (isSupabaseConfigured) {
        const { data: rows, error: queryError } = await supabase
          .from('issues')
          .select('*,issue_metrics(upvotes,downvotes,comments,shares,twitter_impressions)')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });
        if (queryError) throw queryError;
        const reports = await Promise.all((rows ?? []).map(mapDatabaseIssueRow));
        if (active) setData(reports);
      } else {
        throw new Error('Supabase is not configured.');
      }
      } catch (cause) {
        if (active) setError(formatSupabaseError(cause, 'Could not load your reports.'));
      }
    };
    void load();
    return () => { active = false; };
  }, [session?.user?.id, isGuest, retryCount]);

  const EmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emoji}>📝</Text>
      <Text style={styles.title}>Your voice matters</Text>
      <Text style={styles.message}>
        {isGuest
          ? 'Sign in to view reports you have submitted.'
          : <>You haven't submitted any reports yet.{'\n'}
            Spot an issue? Snap a photo and help{'\n'}improve your neighborhood.</>}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => (
          <EnhancedIssueCard
            item={item}
            onPress={() => navigation.navigate('PostDetail', { id: item.id })}
          />
        )}
        ListHeaderComponent={error ? (
          <View style={styles.errorContainer}>
            <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry loading your reports"
              onPress={() => setRetryCount((attempt) => attempt + 1)}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
        ListEmptyComponent={error ? null : <EmptyState />}
        contentContainerStyle={data.length === 0 ? styles.centerContent : styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    padding: Spacing.md,
  },
  centerContent: {
    flex: 1,
    padding: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 64,
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.h3,
    color: Colors.textMain,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  message: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  errorContainer: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  error: {
    ...Typography.body,
    color: Colors.error,
  },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  retryText: {
    ...Typography.body,
    color: Colors.surface,
    fontWeight: '600',
  },
});
