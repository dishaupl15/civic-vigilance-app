import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform, ScrollView, Image, Dimensions, SafeAreaView } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import TextField from '../components/ui/TextField';
import Button from '../components/ui/Button';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Layout, BorderRadius, Shadows } from '../constants/DesignSystem';
import { LinearGradient } from 'expo-linear-gradient'; // Ensure this is installed, otherwise fallback to View
import { validateEmail } from '../lib/authValidation';

const { height } = Dimensions.get('window');

export default function LoginScreen({ navigation }: any) {
  const { signIn, signInAsGuest } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  const onSubmit = async () => {
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setLoading(true);
    try {
      const res = await signIn(email, password);
      if (res?.error) setError(res.error);
    } catch {
      setError('Could not sign in. Check your connection and try again.');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.mainContainer}>
      <LinearGradient
        colors={[Colors.primaryDark, Colors.primary, Colors.primaryLight]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerContainer}>
            <View style={styles.logoCircle}>
              {/* Placeholder for Logo if image fails, transparent bg */}
              <Image
                source={require('../assets/logo-icon.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.tagline}>Empowering Citizens, Improving Cities</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Sign in to continue reporting</Text>

            {!!error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={20} color={Colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TextField
              label="Email"
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
              startIcon={<Ionicons name="mail-outline" size={20} color={Colors.textMuted} />}
            />

            <TextField
              label="Password"
              placeholder="••••••••"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!loading}
              startIcon={<Ionicons name="lock-closed-outline" size={20} color={Colors.textMuted} />}
            />

            <View style={styles.forgotContainer}>
              <Pressable onPress={() => navigation.navigate('ForgotPassword')}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
            </View>

            <Button
              title={loading ? "Signing in..." : "Sign In"}
              onPress={onSubmit}
              disabled={loading}
              variant="primary"
              size="lg"
            />

            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <Button
              title="Try Demo (Guest Mode)"
              variant="secondary"
              icon={<Ionicons name="person-circle-outline" size={20} color={Colors.primary} />}
              onPress={() => signInAsGuest()}
            />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account?</Text>
            <Pressable onPress={() => navigation.navigate('Signup')}>
              <Text style={styles.signupText}>Create Account</Text>
            </Pressable>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: Spacing.screenPadding,
    justifyContent: 'center',
    minHeight: height,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    marginTop: Spacing.xl,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 30,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.lg,
    marginBottom: Spacing.md,
  },
  logo: {
    width: 80,
    height: 80,
  },
  tagline: {
    ...Typography.body,
    color: Colors.textInverse, // Visible on dark gradient
    opacity: 0.9,
    textAlign: 'center',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    ...Shadows.lg,
    width: '100%',
  },
  title: {
    ...Typography.h2,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.errorLight,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.errorBorder,
  },
  errorText: {
    color: Colors.error,
    marginLeft: 8,
    flex: 1,
    fontSize: 14,
  },
  forgotContainer: {
    alignItems: 'flex-end',
    marginBottom: Spacing.lg,
  },
  forgotText: {
    ...Typography.link,
    fontSize: 14,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    marginHorizontal: Spacing.md,
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  footerText: {
    color: Colors.textInverse, // On gradient
    fontSize: 16,
    marginRight: 6,
  },
  signupText: {
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: 16,
    textDecorationLine: 'underline',
  },
});
