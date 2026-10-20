import React, { useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/ui/Button';
import { validateEmail } from '../lib/authValidation';

export default function ForgotPasswordScreen() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const submittingRef = useRef(false);

  const onSubmit = async () => {
    const validationError = validateEmail(email);
    if (validationError) {
      setError(validationError);
      setMessage(null);
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await resetPassword(email);
      if (res?.error) setError(res.error);
      else setMessage('If this email is registered, a password reset link has been sent. Open it on this device to choose a new password.');
    } catch {
      setError('Could not send a reset link. Check your connection and try again.');
    } finally {
      submittingRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Reset password</Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!message && <Text style={styles.message}>{message}</Text>}
      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Button title={isLoading ? 'Sending...' : 'Send reset link'} onPress={() => void onSubmit()} disabled={isLoading} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: '#fafafa' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 8, padding: 12 },
  error: { color: 'crimson' },
  message: { color: 'green' }
});
