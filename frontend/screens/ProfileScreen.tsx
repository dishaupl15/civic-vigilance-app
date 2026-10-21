import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, Alert, ScrollView, StatusBar, Linking, Platform } from 'react-native';
import { Colors, Typography, Spacing, Shadows, BorderRadius, Layout, colors, textColors } from '../constants/DesignSystem';
import { useAuth } from '../hooks/useAuth';
import ListItem from '../components/ListItem';
import Button from '../components/ui/Button';
import { Ionicons } from '@expo/vector-icons';
import TextField from '../components/ui/TextField';
import { loadProfile, saveProfile } from '../lib/profile';
import { normalizePhoneNumber, validateEmail, validatePersonName, validatePhoneNumber } from '../lib/authValidation';
import { validateUsername } from '../lib/username';

export default function ProfileScreen({ navigation }: any) {
  const { session, profile: authProfile, signOut, isGuest, refreshProfile } = useAuth();
  const userId = session?.user?.id || 'demo-user';
  const email = session?.user?.email || 'demo@example.com';
  const [profileData, setProfileData] = useState<any>(authProfile);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [joined, setJoined] = useState<string>('2025');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const p = await loadProfile(userId);
        if (!active) return;
        setProfileData(p);
        setAvatar((p as any).photoURL as string || (p as any).avatar_url as string || null);
        const year = new Date((p as any).createdAt || (p as any).created_at || Date.now()).getFullYear();
        setJoined(String(year));
      } catch {
        if (active) setProfileError('Could not load your profile. Check your connection and retry.');
      }
    };
    void run();
    return () => { active = false; };
  }, [userId]);

  const startEditing = () => {
    const savedFullName = String(profileData?.full_name || '').trim();
    const savedNameParts = savedFullName.split(/\s+/);
    setFirstName(profileData?.first_name || savedNameParts[0] || '');
    setLastName(profileData?.last_name || savedNameParts.slice(1).join(' '));
    setUsername(profileData?.username || '');
    setPhoneNumber(profileData?.phone_number || '');
    setProfileError('');
    setProfileSuccess('');
    setIsEditing(true);
  };

  const saveChanges = async () => {
    if (isSaving) return;
    const firstNameError = validatePersonName(firstName, 'First name');
    if (firstNameError) return setProfileError(firstNameError);
    const lastNameError = validatePersonName(lastName, 'Last name');
    if (lastNameError) return setProfileError(lastNameError);
    const emailError = validateEmail(email);
    if (emailError) return setProfileError('The account email could not be verified. Sign out and sign in again.');
    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername) {
      const usernameError = validateUsername(cleanUsername);
      if (!usernameError.isValid) return setProfileError(usernameError.error || 'Enter a valid username.');
    }
    const phoneError = validatePhoneNumber(phoneNumber);
    if (phoneError) return setProfileError(phoneError);

    setIsSaving(true);
    setProfileError('');
    setProfileSuccess('');
    try {
      const first = firstName.trim();
      const last = lastName.trim();
      const updated = await saveProfile({
        id: userId,
        first_name: first,
        last_name: last,
        full_name: `${first} ${last}`,
        username: cleanUsername || null,
        phone_number: normalizePhoneNumber(phoneNumber) || null,
      } as any);
      setProfileData(updated);
      await refreshProfile();
      setProfileSuccess('Profile updated successfully.');
      setIsEditing(false);
    } catch (error: any) {
      const code = String(error?.code || error?.details || '');
      setProfileError(code.includes('23505')
        ? 'That username is already in use. Choose another username.'
        : 'Could not save your profile. Check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const performSignOut = async () => {
    const result = await signOut();
    if (result?.error) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`Logout failed: ${result.error}`);
      } else {
        Alert.alert('Logout failed', result.error);
      }
    }
  };

  const onLogout = () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('You will need to sign in again to report issues.')) {
        void performSignOut();
      }
      return;
    }

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
          <View style={styles.avatarContainer}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Ionicons name="person" size={50} color={Colors.primary} />
              </View>
            )}
          </View>

          <Text style={styles.name}>
            {[profileData?.first_name, profileData?.last_name].filter(Boolean).join(' ')
              || profileData?.full_name
              || 'Complete your profile'}
          </Text>
          <Text style={styles.email}>{email}</Text>
          {!!profileData?.username && <Text style={styles.profileDetail}>@{profileData.username}</Text>}
          {!!profileData?.phone_number && <Text style={styles.profileDetail}>{profileData.phone_number}</Text>}
          <View style={styles.joinedBadge}>
            <Text style={styles.joinedText}>Member since {joined}</Text>
          </View>
          {profileError && !isEditing ? <Text accessibilityRole="alert" style={styles.profileError}>{profileError}</Text> : null}
          {profileSuccess ? <Text accessibilityRole="text" style={styles.profileSuccess}>{profileSuccess}</Text> : null}
          {!isGuest && !isEditing ? (
            <Button title="Edit Profile" onPress={startEditing} variant="outline" style={styles.editProfileButton} />
          ) : null}
        </View>

        {isEditing && (
          <View style={styles.editCard}>
            <Text style={styles.sectionTitle}>Edit Profile</Text>
            <Text style={styles.emailNote}>Email changes use the verified account email flow and can’t be edited here.</Text>
            <TextField label="First name *" value={firstName} onChangeText={setFirstName} editable={!isSaving} autoCapitalize="words" autoCorrect={false} textContentType="givenName" />
            <TextField label="Last name *" value={lastName} onChangeText={setLastName} editable={!isSaving} autoCapitalize="words" autoCorrect={false} textContentType="familyName" />
            <TextField label="Username (optional)" value={username} onChangeText={setUsername} editable={!isSaving} autoCapitalize="none" autoCorrect={false} maxLength={20} textContentType="username" />
            <TextField label="Phone number (optional)" value={phoneNumber} onChangeText={setPhoneNumber} editable={!isSaving} autoCapitalize="none" keyboardType="phone-pad" textContentType="telephoneNumber" placeholder="+14155552671" />
            {profileError ? <Text accessibilityRole="alert" style={styles.profileError}>{profileError}</Text> : null}
            <View style={styles.editActions}>
              <Button title="Cancel" onPress={() => { setIsEditing(false); setProfileError(''); }} variant="outline" disabled={isSaving} style={{ flex: 1 }} />
              <Button title={isSaving ? 'Saving…' : 'Save'} onPress={() => void saveChanges()} disabled={isSaving} style={{ flex: 1 }} />
            </View>
          </View>
        )}

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
  name: {
    ...Typography.h2,
    marginBottom: 4,
  },
  email: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  profileDetail: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  profileError: {
    ...Typography.caption,
    color: Colors.error,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  profileSuccess: {
    ...Typography.caption,
    color: Colors.success,
    marginTop: Spacing.sm,
  },
  editProfileButton: { alignSelf: 'stretch', marginTop: Spacing.md },
  editCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emailNote: { ...Typography.caption, color: Colors.textSecondary, marginBottom: Spacing.md },
  editActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
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
