import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, Pressable, Alert, ScrollView, StatusBar, SafeAreaView, Linking } from 'react-native';
import { Colors, Typography, Spacing, Shadows, BorderRadius, Layout, colors, textColors } from '../constants/DesignSystem';
import { useAuth } from '../hooks/useAuth';
import ListItem from '../components/ListItem';
import Button from '../components/ui/Button';
import { Ionicons } from '@expo/vector-icons';
import { loadProfile, saveProfile, pickAvatar } from '../lib/profile';
import { LinearGradient } from 'expo-linear-gradient';

export default function ProfileScreen({ navigation }: any) {
  const { session, profile: authProfile, signOut, isGuest } = useAuth();
  const userId = session?.user?.id || 'demo-user';
  const email = session?.user?.email || 'demo@example.com';
  const [name, setName] = useState<string>('Civic User');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [joined, setJoined] = useState<string>('2025');

  useEffect(() => {
    const run = async () => {
      const p = await loadProfile(userId);
      setName(p.full_name || 'Civic User');
      setAvatar((p as any).photoURL as string || (p as any).avatar_url as string || null);
      const year = new Date((p as any).createdAt || (p as any).created_at || Date.now()).getFullYear();
      setJoined(String(year));
    };
    run();
  }, [userId]);

  const onChangeAvatar = async () => {
    if (isGuest) return;
    const uri = await pickAvatar();
    if (!uri) return;
    const updated = await saveProfile({ id: userId, full_name: name, photoURL: uri } as any);
    setAvatar((updated as any).photoURL as string || (updated as any).avatar_url as string || uri);
  };

  const performSignOut = async () => {
    const result = await signOut();
    if (result?.error) Alert.alert('Logout failed', result.error);
  };

  const onLogout = () => {
    Alert.alert('Log out?', 'You will need to sign in again to report issues.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await performSignOut();
        },
      }
    ]);
  };

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" />
      {/* White Header Background */}
      <View style={styles.headerBackground} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <Pressable onPress={onChangeAvatar} style={styles.avatarContainer}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Ionicons name="person" size={50} color={Colors.primary} />
              </View>
            )}
            {!isGuest && (
              <View style={styles.cameraIcon}>
                <Ionicons name="camera" size={16} color="white" />
              </View>
            )}
          </Pressable>

          <Text style={styles.name}>{name}</Text>
          <Text style={styles.email}>{email}</Text>
          <View style={styles.joinedBadge}>
            <Text style={styles.joinedText}>Member since {joined}</Text>
          </View>
        </View>

        {/* Statistics Row / Civic Impact Score */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{authProfile?.stats?.totalPosts ?? 0}</Text>
            <Text style={styles.statLabel}>Reports</Text>
          </View>
          <View style={styles.verticalDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{authProfile?.stats?.totalUpvotes ?? 0}</Text>
            <Text style={styles.statLabel}>Upvotes</Text>
          </View>
          <View style={styles.verticalDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{authProfile?.stats?.totalShares ?? 0}</Text>
            <Text style={styles.statLabel}>Shares</Text>
          </View>
        </View>

        {!isGuest && (
          <>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.menuCard}>
              <ListItem icon="document-text-outline" title="My Reports" onPress={() => navigation.navigate('MyReports')} />
              <ListItem icon="settings-outline" title="Settings" onPress={() => navigation.navigate('Settings')} />
              <ListItem icon="notifications-outline" title="Notifications" onPress={() => navigation.navigate('Notifications')} />
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.menuCard}>
          <ListItem icon="shield-outline" title="Privacy Policy" onPress={() => navigation.navigate('PrivacyPolicy')} />
          <ListItem icon="help-circle-outline" title="Help & Support" onPress={() => Linking.openURL('mailto:support@civicvigilance.com?subject=Help%20Request')} />
          {__DEV__ && (
            <ListItem icon="bug-outline" title="Debug Info" onPress={() => navigation.navigate('Debug')} />
          )}
        </View>

        <View style={{ height: 24 }} />
        {isGuest ? (
          <Button title="Sign In / Create Account" onPress={() => void performSignOut()} variant="primary" />
        ) : (
          <Button title="Log Out" onPress={onLogout} variant="danger" />
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: colors.backgroundMain,
  },
  headerBackground: {
    height: 160,
    width: '100%',
    position: 'absolute',
    top: 0,
    zIndex: 0,
    backgroundColor: colors.surfaceWhite,
    borderBottomWidth: 1,
    borderColor: colors.divider,
  },
  scrollContent: {
    paddingTop: 100, // Push content down to overlap header
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 100,
  },
  profileCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    alignItems: 'center',
    ...Shadows.lg,
    marginBottom: Spacing.lg,
  },
  avatarContainer: {
    marginTop: -60, // Pull up out of card
    marginBottom: Spacing.md,
    ...Shadows.md,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 4,
    borderColor: Colors.surface,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  name: {
    ...Typography.h2,
    marginBottom: 4,
  },
  email: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  joinedBadge: {
    backgroundColor: Colors.surfaceHighlight,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
  },
  joinedText: {
    ...Typography.caption,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.trustBlue, // Deep Blue Civic Impact Score card
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xl,
    ...Shadows.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: textColors.whiteText,
  },
  statLabel: {
    ...Typography.caption,
    marginTop: 2,
    color: 'rgba(255,255,255,0.8)', // Lighter text on the dark blue
  },
  verticalDivider: {
    width: 1,
    height: '60%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    marginLeft: 4,
  },
  menuCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.lg,
    ...Shadows.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
