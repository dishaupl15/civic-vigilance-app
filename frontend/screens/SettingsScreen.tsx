/**
 * Settings Screen
 *
 * Comprehensive settings with all user preferences:
 * - Account settings
 * - Privacy preferences
 * - Notification settings
 * - Connected accounts
 * - About & Legal
 */

import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Switch, Alert, ActivityIndicator, Share, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { saveProfile } from '../lib/profile';
import { useAuth } from '../hooks/useAuth';
import { isSupabaseConfigured } from '../lib/supabase';
import { deleteCurrentAccount, exportCurrentAccount } from '../lib/accountApi';
import { getBackend } from '../lib/backend';

export default function SettingsScreen() {
  const navigation = useNavigation<any>();

  /* REAL BACKEND INTEGRATION */
  const { profile, signOut, refreshProfile } = useAuth();
  const [isSaving, setIsSaving] = useState(false);

  // If no profile yet (loading), show loading skeleton
  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={24} color={Colors.textMain} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ ...Typography.bodySm, color: Colors.textMuted, marginTop: Spacing.md }}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleUpdate = async (updates: Partial<typeof profile>) => {
    setIsSaving(true);
    try {
      if (!profile.uid) return;
      // We use 'id' in backend payload, but 'uid' in local User type. 
      // saveProfile expects UserProfile which has intersection.
      // We pass { ...updates, id: profile.uid } to satisfy UserProfile expectation.
      await saveProfile({ ...updates, id: profile.uid } as any);
      await refreshProfile();
    } catch (error) {
      Alert.alert('Error', 'Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleNotification = async (key: keyof typeof profile.preferences.notifications) => {
    const current = profile.preferences.notifications[key];
    const updatedNotifications = {
      ...profile.preferences.notifications,
      [key]: !current,
    };

    await handleUpdate({
      preferences: {
        ...profile.preferences,
        notifications: updatedNotifications,
      },
    });
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            const result = await signOut();
            if (result?.error) Alert.alert('Logout failed', result.error);
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action cannot be undone. All your reports and data will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (getBackend() === 'supabase' && isSupabaseConfigured) {
                await deleteCurrentAccount();
                const signOutResult = await signOut();
                if (signOutResult?.error) {
                  Alert.alert(
                    'Account deleted',
                    'Your account was deleted, but we could not confirm logout. Please close the app and sign in again if needed.',
                  );
                  return;
                }
                Alert.alert('Account Deleted', 'Your account and associated application data were permanently deleted.');
              } else {
                const signOutResult = await signOut();
                if (signOutResult?.error) Alert.alert('Logout failed', signOutResult.error);
              }
            } catch {
              Alert.alert('Error', 'Failed to delete account. Please email support@civicvigilance.com for assistance.');
            }
          },
        },
      ]
    );
  };

  const handleRequestDataExport = () => {
    Alert.alert(
      'Request Data Export',
      'We will email a copy of your data to your registered email address within 72 hours.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request Export',
          onPress: async () => {
            try {
              if (getBackend() !== 'supabase') {
                return Alert.alert('Local Account', 'Local development accounts do not have a server data export.');
              }
              const exported = await exportCurrentAccount();
              const json = JSON.stringify(exported, null, 2);
              if (Platform.OS === 'web' && typeof document !== 'undefined') {
                const href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
                const link = document.createElement('a');
                link.href = href;
                link.download = 'civic-vigilance-data-export.json';
                link.click();
                URL.revokeObjectURL(href);
              } else {
                await Share.share({ title: 'Civic Vigilance data export', message: json });
              }
            } catch (error: any) {
              Alert.alert('Export Failed', error?.message || 'Could not export your data.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={Colors.textMain} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          <TouchableOpacity style={styles.settingRow} onPress={() => navigation.navigate('ProfileHome')} accessibilityRole="button" accessibilityLabel="Edit username">
            <View style={styles.settingLeft}>
              <Ionicons name="person-outline" size={22} color="#4B5563" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Username</Text>
                <Text style={styles.settingValue}>@{profile.username}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Ionicons name="mail-outline" size={22} color="#4B5563" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Email</Text>
                <Text style={styles.settingValue}>{profile.email || 'Verified'}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Ionicons name="eye-off-outline" size={22} color="#4B5563" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Anonymous Mode</Text>
                <Text style={styles.settingSubtext}>Hide your real identity</Text>
              </View>
            </View>
            <Switch
              value={profile.anonymousMode}
              onValueChange={(val) => handleUpdate({ anonymousMode: val })}
              trackColor={{ false: '#D1D5DB', true: '#2563EB' }}
            />
          </View>
        </View>

        {/* Privacy Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy</Text>

          <TouchableOpacity style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Ionicons name="shield-outline" size={22} color="#4B5563" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Default Privacy</Text>
                <Text style={styles.settingValue}>
                  {profile.privacyDefault === 'twitter' ? 'Share on X' : 'App Only'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Ionicons name="eye-outline" size={22} color="#4B5563" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Profile Visibility</Text>
                <Text style={styles.settingValue}>{profile.privacySettings.profileVisibility}</Text>
              </View>
            </View>
            <Switch
              value={profile.privacySettings.profileVisibility === 'public'}
              onValueChange={(val) =>
                handleUpdate({
                  privacySettings: {
                    ...profile.privacySettings,
                    profileVisibility: val ? 'public' : 'private'
                  }
                })
              }
              trackColor={{ false: '#D1D5DB', true: '#2563EB' }}
            />
          </View>

          {/* Show Location */}
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Ionicons name="location-outline" size={22} color="#4B5563" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Show Location</Text>
                <Text style={styles.settingSubtext}>Display city/state on profile</Text>
              </View>
            </View>
            <Switch
              value={profile.privacySettings.showLocation}
              onValueChange={(val) =>
                handleUpdate({
                  privacySettings: {
                    ...profile.privacySettings,
                    showLocation: val
                  }
                })
              }
              trackColor={{ false: '#D1D5DB', true: '#2563EB' }}
            />
          </View>

        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Ionicons name="location" size={22} color="#4B5563" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Nearby Issues</Text>
                <Text style={styles.settingSubtext}>Issues within 2km</Text>
              </View>
            </View>
            <Switch
              value={profile.preferences?.notifications?.nearby ?? true}
              onValueChange={() => toggleNotification('nearby')}
              trackColor={{ false: '#D1D5DB', true: '#2563EB' }}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Ionicons name="chatbubble-outline" size={22} color="#4B5563" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Comments</Text>
                <Text style={styles.settingSubtext}>On your posts</Text>
              </View>
            </View>
            <Switch
              value={profile.preferences?.notifications?.comments ?? true}
              onValueChange={() => toggleNotification('comments')}
              trackColor={{ false: '#D1D5DB', true: '#2563EB' }}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Ionicons name="arrow-up-outline" size={22} color="#4B5563" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Upvotes</Text>
                <Text style={styles.settingSubtext}>When someone upvotes you</Text>
              </View>
            </View>
            <Switch
              value={profile.preferences?.notifications?.upvotes ?? true}
              onValueChange={() => toggleNotification('upvotes')}
              trackColor={{ false: '#D1D5DB', true: '#2563EB' }}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Ionicons name="logo-twitter" size={22} color="#1DA1F2" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Twitter Engagement</Text>
                <Text style={styles.settingSubtext}>Retweets, likes on Twitter</Text>
              </View>
            </View>
            <Switch
              value={profile.preferences?.notifications?.twitter ?? false}
              onValueChange={() => toggleNotification('twitter')}
              trackColor={{ false: '#D1D5DB', true: '#2563EB' }}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Ionicons name="mail-open-outline" size={22} color="#4B5563" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Weekly Digest</Text>
                <Text style={styles.settingSubtext}>Summary email every week</Text>
              </View>
            </View>
            <Switch
              value={profile.preferences?.notifications?.digest ?? true}
              onValueChange={() => toggleNotification('digest')}
              trackColor={{ false: '#D1D5DB', true: '#2563EB' }}
            />
          </View>

        </View>

        {/* About & Legal */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About & Legal</Text>

          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => navigation.navigate('TermsOfService')}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="document-text-outline" size={22} color="#4B5563" />
              <Text style={styles.settingLabel}>Terms of Service</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => navigation.navigate('PrivacyPolicy')}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="shield-checkmark-outline" size={22} color="#4B5563" />
              <Text style={styles.settingLabel}>Privacy Policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Ionicons name="information-circle-outline" size={22} color="#4B5563" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Version</Text>
                <Text style={styles.settingValue}>1.0.0 (Build 1)</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Data & Privacy */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data & Privacy</Text>

          <TouchableOpacity style={styles.settingRow} onPress={handleRequestDataExport} accessibilityRole="button">
            <View style={styles.settingLeft}>
              <Ionicons name="download-outline" size={22} color="#4B5563" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Request Data Export</Text>
                <Text style={styles.settingSubtext}>Get a copy of your data via email</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Actions</Text>

          <TouchableOpacity style={styles.settingRowDanger} onPress={handleLogout} accessibilityRole="button" accessibilityLabel="Logout">
            <View style={styles.settingLeft}>
              <Ionicons name="log-out-outline" size={22} color={Colors.error} />
              <Text style={styles.settingLabelDanger}>Logout</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRowDanger} onPress={handleDeleteAccount} accessibilityRole="button" accessibilityLabel="Delete account">
            <View style={styles.settingLeft}>
              <Ionicons name="trash-outline" size={22} color={Colors.error} />
              <Text style={styles.settingLabelDanger}>Delete Account</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

import { Colors, Shadows, Spacing, Typography, BorderRadius } from '../constants/DesignSystem';

// ... (rest of code)

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    ...Shadows.sm,
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.textMain,
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    ...Typography.caption,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.background,
  },
  settingRowDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#FEE2E2', // Keep distinct danger tint
    backgroundColor: '#FEF2F2', // Subtle red bg for danger (optional)
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingText: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.textMain,
  },
  settingLabelDanger: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.error,
  },
  settingValue: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  settingSubtext: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  settingConnected: {
    fontSize: 14,
    color: Colors.success,
    marginTop: 2,
    fontWeight: '500',
  },
  settingDisconnected: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
