import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BorderRadius, Colors, Shadows, Typography } from '../../constants/DesignSystem';
import type { CategoryKey } from '../../types';
import { requestReportContent } from '../../lib/reportAssistance';
import type { GeneratedReportContent } from '../../lib/reportContentSchema';
import Button from '../ui/Button';

interface Props {
  title: string;
  category: CategoryKey;
  description: string;
  onGenerated: (content: GeneratedReportContent) => void;
  onUseTitle: (value: string) => void;
  onUseDescription: (value: string) => void;
  onUseCategory: (value: CategoryKey) => void;
}

export default function ReportAiAssistance({
  title,
  category,
  description,
  onGenerated,
  onUseTitle,
  onUseDescription,
  onUseCategory,
}: Props) {
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedReportContent | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const content = await requestReportContent({ title, category, description }, privacyAccepted);
      setGenerated(content);
      onGenerated(content);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI writing assistance is unavailable. Continue manually.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card} accessible accessibilityLabel="Optional AI writing assistance">
      <Text style={styles.title}>AI writing assistance (optional)</Text>
      <Text style={styles.notice}>
        With your consent, only this report’s title, category, and description are sent to the configured AI service.
        Photos, address, and coordinates are not sent. AI drafts may be inaccurate; review and edit every result.
      </Text>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel="Consent to send report details for AI writing"
        accessibilityState={{ checked: privacyAccepted }}
        onPress={() => setPrivacyAccepted((accepted) => !accepted)}
        style={styles.consentRow}
      >
        <Text style={styles.checkbox}>{privacyAccepted ? '☑' : '□'}</Text>
        <Text style={styles.consentText}>I agree to send these report details for AI-assisted drafting.</Text>
      </Pressable>
      {description.trim().length < 10 && (
        <Text style={styles.notice}>Add at least 10 characters to the report description to enable drafting.</Text>
      )}
      <Button
        title={loading ? 'Generating drafts…' : generated ? 'Regenerate drafts' : 'Generate related content'}
        onPress={() => void generate()}
        disabled={!privacyAccepted || loading || description.trim().length < 10}
        variant="outline"
      />
      {loading && <ActivityIndicator accessibilityLabel="Generating AI drafts" color={Colors.primary} style={styles.spinner} />}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {generated && (
        <View style={styles.results}>
          <Text style={styles.generatedLabel}>AI-generated drafts — review before use</Text>
          {generated.clarification_question && (
            <Text style={styles.notice}>Please add this missing detail before using a draft: {generated.clarification_question}</Text>
          )}
          <Text style={styles.fieldLabel}>Report title (editable)</Text>
          <TextInput
            accessibilityLabel="AI-generated title draft"
            style={styles.input}
            value={generated.title}
            onChangeText={(value) => setGenerated((current) => current ? { ...current, title: value } : current)}
            maxLength={100}
          />
          <Button title="Use this title" onPress={() => onUseTitle(generated.title)} variant="outline" />
          <Text style={styles.fieldLabel}>Report description (editable)</Text>
          <TextInput
            accessibilityLabel="AI-generated description draft"
            style={[styles.input, styles.multiline]}
            value={generated.description}
            onChangeText={(value) => setGenerated((current) => current ? { ...current, description: value } : current)}
            multiline
            maxLength={1000}
          />
          <Button title="Use this description" onPress={() => onUseDescription(generated.description)} variant="outline" />
          {generated.category_suggestion && generated.category_suggestion !== category && (
            <View>
              <Text style={styles.fieldLabel}>Category suggestion: {generated.category_suggestion.replace(/_/g, ' ')}</Text>
              <Button title="Use suggested category" onPress={() => onUseCategory(generated.category_suggestion!)} variant="outline" />
            </View>
          )}
          <Text style={styles.fieldLabel}>Separate issue summary (editable; long-press to copy)</Text>
          <TextInput
            accessibilityLabel="AI-generated summary"
            style={[styles.input, styles.multiline]}
            value={generated.summary}
            onChangeText={(value) => setGenerated((current) => current ? { ...current, summary: value } : current)}
            multiline
            selectTextOnFocus
          />
          <Text style={styles.fieldLabel}>Optional public-awareness caption (not submitted as report description)</Text>
          <TextInput
            accessibilityLabel="AI-generated awareness caption"
            style={[styles.input, styles.multiline]}
            value={generated.awareness_caption}
            onChangeText={(value) => setGenerated((current) => current ? { ...current, awareness_caption: value } : current)}
            multiline
            selectTextOnFocus
          />
          <Text style={styles.fieldLabel}>Hashtags (editable; long-press to copy)</Text>
          <TextInput
            accessibilityLabel="AI-generated hashtags"
            style={styles.input}
            value={generated.hashtags.join(' ')}
            onChangeText={(value) => setGenerated((current) => current ? {
              ...current,
              hashtags: value.split(/\s+/).filter(Boolean).slice(0, 8),
            } : current)}
            selectTextOnFocus
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: 16, marginBottom: 16, ...Shadows.sm },
  title: { ...Typography.h4, marginBottom: 8 },
  notice: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 10 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8 },
  checkbox: { color: Colors.primary, fontSize: 20 },
  consentText: { flex: 1, color: Colors.textMain, fontSize: 14, lineHeight: 20 },
  spinner: { marginTop: 12 },
  error: { color: Colors.error, marginTop: 10, fontSize: 14 },
  results: { marginTop: 14, gap: 8 },
  generatedLabel: { color: Colors.primary, fontWeight: '700', fontSize: 14 },
  fieldLabel: { color: Colors.textMain, fontWeight: '600', marginTop: 8 },
  input: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm, padding: 10, color: Colors.textMain },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
});
