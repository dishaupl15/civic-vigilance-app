import React, { useState, useEffect } from 'react';
import { View, FlatList, SafeAreaView, StyleSheet, Text, StatusBar, ActivityIndicator, Pressable } from 'react-native';
import * as Location from 'expo-location';
import Header from '../components/Header';
import SortBar from '../components/SortBar';
import EnhancedIssueCard from '../components/EnhancedIssueCard';
import { useIssues } from '../hooks/useIssues';
import { useNavigation } from '@react-navigation/native';
import { calculateDistance } from '../lib/geohash';
import { Colors, Typography, Spacing } from '../constants/DesignSystem';

export default function FeedScreen() {
  const [sort, setSort] = useState<'trending' | 'newest' | 'nearby'>('nearby');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const { data, loading, error, retry } = useIssues(sort, coords);
  const navigation = useNavigation<any>();

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setCoords({ lat: location.coords.latitude, lng: location.coords.longitude });
      } catch (error) {
        if (__DEV__) console.log('[Feed] Location error:', error);
      }
    })();
  }, []);

  const getDistance = (lat?: number, lng?: number): number | undefined => {
    if (sort === 'nearby' && coords && lat !== undefined && lng !== undefined) {
      return calculateDistance(coords.lat, coords.lng, lat, lng);
    }
    return undefined;
  };

  const EmptyState = () => {
    const content = {
      nearby: { emoji: '🏡', title: 'Quiet Neighborhood', msg: 'No reports nearby. Be the first to improve your area!' },
      newest: { emoji: '✨', title: 'Fresh Start', msg: 'No recent reports. Start a new one today.' },
      trending: { emoji: '📈', title: 'Waiting for Trends', msg: 'Issues will appear here as they gain support.' },
    }[sort];

    return (
      <View style={styles.emptyState}>
        <View style={styles.emojiContainer}>
          <Text style={styles.emptyEmoji}>{content.emoji}</Text>
        </View>
        <Text style={styles.emptyTitle}>{content.title}</Text>
        <Text style={styles.emptyMessage}>{content.msg}</Text>
      </View>
    );
  };

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <Header />
        <View style={styles.sortContainer}>
          <SortBar value={sort} onChange={setSort} />
          {sort === 'trending' && (
            <Text style={styles.limitation}>Trending sorts only the fetched reports by engagement; it is not a global ranking.</Text>
          )}
          {sort === 'nearby' && !coords && !loading && (
            <Text style={styles.limitation}>Device location is unavailable; recent reports are shown.</Text>
          )}
          {sort === 'nearby' && coords && (
            <Text style={styles.limitation}>Nearby sorts loaded reports by distance; it is not radius-filtered or global.</Text>
          )}
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry loading reports"
              onPress={retry}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}
        {loading && data.length === 0 && (
          <ActivityIndicator
            accessibilityLabel="Loading reports"
            color={Colors.primary}
            style={styles.loading}
          />
        )}
        <FlatList
          data={data}
          keyExtractor={(item) => String(item.id)}
          refreshing={loading && data.length > 0}
          onRefresh={retry}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <EnhancedIssueCard
              item={item}
              distance={getDistance(item.lat ?? item.location?.lat, item.lng ?? item.location?.lng)}
              onPress={() => navigation.navigate('PostDetail', { id: item.id })}
            />
          )}
          ListEmptyComponent={!loading && !error ? <EmptyState /> : null}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
  sortContainer: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.background,
    zIndex: 10,
  },
  limitation: {
    ...Typography.caption,
    color: Colors.textSecondary,
    paddingTop: Spacing.xs,
  },
  error: {
    ...Typography.body,
    color: Colors.error,
  },
  errorContainer: {
    marginHorizontal: Spacing.screenPadding,
    padding: Spacing.md,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    gap: Spacing.sm,
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
  loading: {
    marginTop: Spacing.xl,
  },
  listContent: {
    paddingHorizontal: Spacing.screenPadding,
    paddingTop: Spacing.sm,
    paddingBottom: 100, // Space for Tab Bar
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: 80,
  },
  emojiContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    // Soft shadow
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyEmoji: {
    fontSize: 40,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.textMain,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptyMessage: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
