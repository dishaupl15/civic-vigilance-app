import React, { useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/ui/Button';
import TextField from '../components/ui/TextField';
import { BorderRadius, Colors, Spacing, Typography } from '../constants/DesignSystem';
import { validateNewPassword } from '../lib/authValidation';

export default function UpdatePasswordScreen() {
  const { updatePassword, cancelPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUpdate = async () => {
    const validationError = validateNewPassword(password, confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await updatePassword(password);
      if (result?.error) setError(result.error);
      else Alert.alert('Password updated', 'Your password has been changed.');
    } catch {
      setError('Could not update the password. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await cancelPasswordRecovery();
      if (result?.error) setError(result.error);
    } catch {
      setError('Could not cancel password recovery. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.form}>
        <Text style={styles.title}>Choose a new password</Text>
        <Text style={styles.description}>
          Use at least 8 characters, including uppercase and lowercase letters and a number.
        </Text>
        {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
        <TextField
          label="New password"
          placeholder="Enter a new password"
          secureTextEntry
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
          editable={!isSubmitting}
        />
        <TextField
          label="Confirm new password"
          placeholder="Re-enter the new password"
          secureTextEntry
          textContentType="newPassword"
          value={confirmation}
          onChangeText={setConfirmation}
          editable={!isSubmitting}
          onSubmitEditing={() => void handleUpdate()}
        />
        <Button
          title={isSubmitting ? 'Updating password...' : 'Update password'}
          onPress={() => void handleUpdate()}
          disabled={isSubmitting || !password || !confirmation}
          size="lg"
        />
        <Button
          title="Cancel and return to sign in"
          onPress={() => void handleCancel()}
          disabled={isSubmitting}
          variant="outline"
          style={styles.cancelButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center' },
  form: {
    margin: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.surface,
  },
  title: { ...Typography.h2, marginBottom: Spacing.sm, textAlign: 'center' },
  description: { ...Typography.bodySm, color: Colors.textSecondary, marginBottom: Spacing.lg, textAlign: 'center' },
  error: {
    ...Typography.bodySm,
    color: Colors.error,
    backgroundColor: Colors.errorLight,
    borderWidth: 1,
    borderColor: Colors.errorBorder,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  cancelButton: { marginTop: Spacing.sm },
});
