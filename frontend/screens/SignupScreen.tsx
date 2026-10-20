import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../hooks/useAuth';
import TextField from '../components/ui/TextField';
import Button from '../components/ui/Button';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '../constants/DesignSystem';
import { getBackend } from '../lib/backend';
import { validateEmail, validateNewPassword } from '../lib/authValidation';

export default function SignupScreen() {
  const { signUp } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmationNotice, setConfirmationNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const submittingRef = useRef(false);

  const onSubmit = async () => {
    const emailError = validateEmail(email);
    if (emailError) return setError(emailError);
    const passwordError = validateNewPassword(password, confirm);
    if (passwordError) return setError(passwordError);

    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true);
    setError(null);
    setConfirmationNotice(null);
    try {
      const res = await signUp(email.trim(), password);
      if (res?.error) {
        setError(res.error);
      } else if (res?.data?.user && Array.isArray(res.data.user.identities) && res.data.user.identities.length === 0) {
        setError('An account with this email already exists. Try signing in or resetting your password.');
      } else if (res?.data?.user && !res.data.session) {
        setConfirmationNotice('Account created. Check your email for a confirmation link before signing in.');
      } else if (!res?.data?.session) {
        setError('Could not confirm account creation. Please try again.');
      }
    } catch {
      setError('Could not create your account. Check your connection and try again.');
    } finally {
      submittingRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 72 : 0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator
        >
          <View style={styles.formCard}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Join the civic movement</Text>
            {getBackend() === 'sqlite' && (
              <Text style={styles.localNotice}>Development mode: this account is stored only on this device.</Text>
            )}

            {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
            {!!confirmationNotice && (
              <Text style={styles.confirmationNotice} accessibilityRole="alert">
                {confirmationNotice}
              </Text>
            )}

            <TextField
              label="Email"
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              editable={!isLoading}
            />
            <TextField
              label="Password"
              placeholder="Enter at least 8 characters"
              secureTextEntry
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
              editable={!isLoading}
            />
            <Text style={styles.passwordHint}>Use at least 8 characters with upper/lowercase letters and a number.</Text>
            <TextField
              label="Confirm password"
              placeholder="Enter the password again"
              secureTextEntry
              textContentType="newPassword"
              value={confirm}
              onChangeText={setConfirm}
              editable={!isLoading}
              onSubmitEditing={() => void onSubmit()}
            />

            <Button
              title={isLoading ? 'Creating account...' : 'Sign up'}
              onPress={onSubmit}
              disabled={isLoading || !email.trim() || !password || !confirm}
              size="lg"
            />

            <Pressable
              onPress={() => navigation.navigate('Login')}
              style={styles.loginLink}
              accessibilityRole="button"
            >
              <Text style={styles.link}>Already have an account? Log in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...Shadows.sm,
  },
  title: { ...Typography.h2, textAlign: 'center', marginBottom: Spacing.xs },
  subtitle: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.lg },
  error: {
    color: Colors.error,
    backgroundColor: Colors.errorLight,
    borderColor: Colors.errorBorder,
    borderWidth: 1,
    padding: 12,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  confirmationNotice: {
    ...Typography.body,
    color: Colors.textMain,
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
    borderWidth: 1,
    padding: 12,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  localNotice: {
    ...Typography.caption,
    color: Colors.textSecondary,
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  passwordHint: { ...Typography.caption, color: Colors.textMuted, marginTop: -Spacing.sm, marginBottom: Spacing.md, marginLeft: Spacing.xs },
  loginLink: { alignSelf: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.lg },
  link: { ...Typography.link, textAlign: 'center', fontWeight: '600' },
});
