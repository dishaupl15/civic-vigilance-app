import React, { useEffect, useState } from 'react';
import { View, FlatList, StyleSheet, Text } from 'react-native';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { IssueWithUserData } from '../types';
import { useAuth } from '../hooks/useAuth';
import { listUserIssues } from '../lib/sqliteIssues';
import { getBackend } from '../lib/backend';

import { Colors, Typography, Spacing } from '../constants/DesignSystem';
import EnhancedIssueCard from '../components/EnhancedIssueCard';
import { mapDatabaseIssueRow, mapLocalIssueRow } from '../lib/issueMapper';

export default function MyReportsScreen({ navigation }: any) {
  const { session } = useAuth();
  const [data, setData] = useState<IssueWithUserData[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!session?.user?.id) return;

      try {
        setError(null);
        if (session.user.id === 'dummy-user-123') {
        setData([{
          id: 'dummy-my-1',
          userId: 'dummy-user-123',
          title: 'My First Report: Uneven Sidewalk',
          description: 'The sidewalk near the school is broken and dangerous for children.',
          category: 'pothole',
          photos: ['https://images.unsplash.com/photo-1596484552993-3d752dd30c33?auto=format&fit=crop&q=80&w=800'],
          location: { lat: 19.1000, lng: 72.8900, address: 'School Lane, Mumbai', geohash: 'te7u' },
          privacy: 'twitter',
          status: 'pending',
          anonymousUsername: 'Guest_User',
          metrics: { upvotes: 5, downvotes: 0, comments: 1, shares: 0 },
          moderation: { flagged: false, reviewed: false, status: 'active' },
          authorities: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        }]);
        return;
      }

      if (getBackend() === 'sqlite') {
        const all = listUserIssues(Number(session.user.id));
        if (active) setData(all.map(mapLocalIssueRow));
      } else if (isSupabaseConfigured) {
        const { data: rows, error: queryError } = await supabase
          .from('issues') // actually reports in v2? check schema
          .select('*,issue_metrics(upvotes,downvotes,comments,shares,twitter_impressions)')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });
        if (queryError) throw new Error('Could not load your reports.');
        const reports = await Promise.all((rows ?? []).map(mapDatabaseIssueRow));
        if (active) setData(reports);
      } else {
        throw new Error('Supabase is not configured.');
      }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load your reports.');
      }
    };
    void load();
    return () => { active = false; };
  }, [session?.user?.id]);

  const EmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emoji}>📝</Text>
      <Text style={styles.title}>Your voice matters</Text>
      <Text style={styles.message}>
        You haven't submitted any reports yet.{'\n'}
        Spot an issue? Snap a photo and help{'\n'}improve your neighborhood.
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
        ListHeaderComponent={error ? <Text accessibilityRole="alert" style={styles.message}>{error}</Text> : null}
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
});
