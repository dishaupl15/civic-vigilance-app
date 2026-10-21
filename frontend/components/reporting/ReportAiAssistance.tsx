import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BorderRadius, Colors, Shadows, Typography } from '../../constants/DesignSystem';
import type { CategoryKey } from '../../types';
import { deletePhoto, uploadPhoto } from '../../lib/storage';
import {
  getReportContentCapabilities,
  requestReportContent,
  ReportAiCapabilities,
  ReportAiGeneration,
} from '../../lib/reportAssistance';
import type { GeneratedReportContent, ReportImageAnalysis } from '../../lib/reportContentSchema';
import Button from '../ui/Button';

interface Props {
  photos: string[];
  title: string;
  category: CategoryKey;
  description: string;
  requestId: string;
  savedImageReference?: string;
  savedImageUri?: string;
  onImageReferenceChange: (reference?: string, photoUri?: string) => void;
  onGenerated: (content: GeneratedReportContent) => void;
  onUseTitle: (value: string) => void;
  onUseDescription: (value: string) => void;
  onUseCategory: (value: CategoryKey) => void;
}

interface GenerationState extends ReportAiGeneration {
  source: {
    photoUri: string;
    title: string;
    category: CategoryKey;
    description: string;
  };
  acceptedTitle?: string;
  acceptedDescription?: string;
  acceptedCategory?: CategoryKey;
  titleApplied?: boolean;
  descriptionApplied?: boolean;
  categoryApplied?: boolean;
}

export default function ReportAiAssistance({
  photos,
  title,
  category,
  description,
  requestId,
  savedImageReference,
  savedImageUri,
  onImageReferenceChange,
  onGenerated,
  onUseTitle,
  onUseDescription,
  onUseCategory,
}: Props) {
  const photoUri = photos[0] || '';
  const requestContext = JSON.stringify([photoUri, title, category, description]);
  const [consentedContext, setConsentedContext] = useState<string | null>(null);
  const privacyAccepted = consentedContext === requestContext;
  const [checkingAvailability, setCheckingAvailability] = useState(true);
  const [available, setAvailable] = useState(false);
  const [capabilities, setCapabilities] = useState<ReportAiCapabilities | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState<GenerationState | null>(null);
  const [uploadedImage, setUploadedImage] = useState<{ reference: string; photoUri: string } | null>(null);
  const currentInputs = useRef({ photoUri, title, category, description });
  currentInputs.current = { photoUri, title, category, description };

  const imageReference = uploadedImage?.photoUri === photoUri
    ? uploadedImage.reference
    : savedImageUri === photoUri
      ? savedImageReference
      : undefined;

  useEffect(() => {
    if (!photoUri) {
      setCheckingAvailability(false);
      setAvailable(false);
      setCapabilities(null);
      setAvailabilityError(null);
      setGeneration(null);
      return undefined;
    }
    let active = true;
    setCheckingAvailability(true);
    setAvailabilityError(null);
    void getReportContentCapabilities()
      .then((result) => {
        if (!active) return;
        setCapabilities(result);
        setAvailable(result.available);
        if (!result.available) {
          setAvailabilityError(null);
        }
      })
      .catch((cause) => {
        if (!active) return;
        setAvailable(false);
        setCapabilities(null);
        setAvailabilityError(cause instanceof Error
          ? cause.message
          : 'Could not check AI writing availability. Retry or continue manually.');
      })
      .finally(() => {
        if (active) setCheckingAvailability(false);
      });
    return () => { active = false; };
  }, [photoUri, availabilityRetry]);

  useEffect(() => {
    if (!generation) return;
    const titleIsCurrent = title === generation.source.title || title === generation.content.title
      || title === generation.acceptedTitle;
    const descriptionIsCurrent = description === generation.source.description
      || description === generation.content.description
      || description === generation.acceptedDescription;
    if (photoUri !== generation.source.photoUri
        || category !== generation.source.category
          && category !== generation.acceptedCategory
        || !titleIsCurrent
        || !descriptionIsCurrent) {
      setGeneration(null);
    }
  }, [photoUri, title, category, description, generation]);

  useEffect(() => {
    if (savedImageReference && savedImageUri && savedImageUri !== photoUri) {
      void deletePhoto(savedImageReference);
      onImageReferenceChange(undefined, undefined);
    }
  }, [photoUri, savedImageReference, savedImageUri, onImageReferenceChange]);

  useEffect(() => {
    if (uploadedImage && uploadedImage.photoUri !== photoUri) setUploadedImage(null);
  }, [photoUri, uploadedImage]);

  const generate = async () => {
    if (loading || !privacyAccepted || !photoUri) return;
    if (!available) {
      const setupItems = [
        ...(capabilities?.missing || []),
        ...(capabilities?.invalid || []),
      ];
      setError(setupItems.length
        ? `AI generation cannot start yet. Configure these backend settings and restart the backend: ${setupItems.join(', ')}.`
        : availabilityError || 'AI availability could not be verified. Check the backend and retry the configuration check.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let reference = imageReference;
      if (!reference) {
        reference = await uploadPhoto(
          photoUri,
          'issues',
          true,
          `${requestId}-ai`,
          true,
        );
        setUploadedImage({ reference, photoUri });
        onImageReferenceChange(reference, photoUri);
      }

      const beforeRequest = currentInputs.current;
      if (beforeRequest.photoUri !== photoUri || beforeRequest.title !== title
          || beforeRequest.category !== category || beforeRequest.description !== description) {
        setError('Your photo or report details changed before generation started. Generate suggestions again to use the current details.');
        return;
      }
      const result = await requestReportContent(
        { title, category, description },
        reference,
        privacyAccepted,
        requestId,
      );
      const current = currentInputs.current;
      if (current.photoUri !== photoUri || current.title !== title
          || current.category !== category || current.description !== description) {
        setError('Your photo or report details changed during generation. Generate suggestions again to use the current details.');
        return;
      }
      const next: GenerationState = {
        ...result,
        source: { photoUri, title, category, description },
      };
      next.acceptedTitle = result.content.title;
      next.acceptedDescription = result.content.description;
      onUseTitle(result.content.title);
      onUseDescription(result.content.description);
      setGeneration(next);
      onGenerated(result.content);
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : 'Photo analysis and report drafting failed. Continue manually or retry.');
    } finally {
      setLoading(false);
    }
  };

  const applyTitle = () => {
    if (!generation) return;
    const apply = () => {
      setGeneration((current) => current
        ? { ...current, acceptedTitle: current.content.title, titleApplied: true }
        : current);
      onUseTitle(generation.content.title);
    };
    if (title.trim() && title !== generation.content.title) {
      Alert.alert('Replace your title?', 'Your current title will be replaced with the AI suggestion.', [
        { text: 'Keep my title', style: 'cancel' },
        { text: 'Replace title', onPress: apply },
      ]);
    } else {
      apply();
    }
  };

  const applyDescription = () => {
    if (!generation) return;
    const apply = () => {
      setGeneration((current) => current
        ? { ...current, acceptedDescription: current.content.description, descriptionApplied: true }
        : current);
      onUseDescription(generation.content.description);
    };
    if (description.trim() && description !== generation.content.description) {
      Alert.alert('Replace your description?', 'Your current description will be replaced with the AI suggestion.', [
        { text: 'Keep my description', style: 'cancel' },
        { text: 'Replace description', onPress: apply },
      ]);
    } else {
      apply();
    }
  };

  const applyCategory = () => {
    const suggestedCategory = generation?.content.category_suggestion;
    if (!suggestedCategory) return;
    Alert.alert(
      'Use suggested category?',
      'The selected report category will change to the AI suggestion. Review it before submitting.',
      [
        { text: 'Keep my category', style: 'cancel' },
        { text: 'Change category', onPress: () => {
          onUseCategory(suggestedCategory);
          setGeneration((current) => current
            ? { ...current, acceptedCategory: suggestedCategory, categoryApplied: true }
            : current);
        } },
      ],
    );
  };

  const imageAnalysis: ReportImageAnalysis | undefined = generation?.analysis;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>AI photo analysis and writing (optional)</Text>
      <Text style={styles.notice}>
        With your consent, the selected evidence photo and the title, category, and description entered here are sent to Civic Vigilance’s configured AI services. Location details are not sent. AI suggestions may be inaccurate; review and edit them before submitting.
      </Text>
      <Text style={styles.notice}>
        The selected photo and report details are sent to the backend-configured AI provider for processing. Do not submit sensitive or confidential content unless you have permission and accept the provider's terms.
      </Text>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel="Consent to send the selected photo and report details for AI assistance"
        accessibilityState={{ checked: privacyAccepted }}
        onPress={() => setConsentedContext((current) => (
          current === requestContext ? null : requestContext
        ))}
        style={styles.consentRow}
      >
        <Text style={styles.checkbox}>{privacyAccepted ? '☑' : '□'}</Text>
        <Text style={styles.consentText}>I agree to send this photo and these report details for AI-assisted drafting.</Text>
      </Pressable>
      {!photoUri && <Text style={styles.notice}>Select a photo before generating report content.</Text>}
      {checkingAvailability && <Text style={styles.notice}>Checking photo-analysis service availability…</Text>}
      {!!availabilityError && !checkingAvailability && (
        <View>
          <Text accessibilityRole="alert" style={styles.error}>{availabilityError}</Text>
          {!!photoUri && (
            <Pressable accessibilityRole="button" onPress={() => setAvailabilityRetry((retry) => retry + 1)}>
              <Text style={styles.retry}>Retry availability check</Text>
            </Pressable>
          )}
        </View>
      )}
      {!available && !checkingAvailability && !availabilityError && capabilities && (
        <View>
          <Text accessibilityRole="alert" style={styles.error}>
            The photo-based AI service isn’t configured correctly on the backend. Fix the settings listed below, then restart or redeploy the backend.
          </Text>
          {capabilities.missing.map((name) => (
            <Text key={name} style={styles.configItem}>Missing: {name}</Text>
          ))}
          {capabilities.invalid.map((name) => (
            <Text key={name} style={styles.configItem}>Invalid: {name}</Text>
          ))}
          <Text style={styles.configHelp}>
            Keep provider keys on the Node backend only; never put them in frontend .env or EXPO_PUBLIC_ settings.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setAvailabilityRetry((retry) => retry + 1)}>
            <Text style={styles.retry}>Check backend configuration again</Text>
          </Pressable>
        </View>
      )}
      <Button
        title={loading ? 'Analyzing photo and generating report…' : generation ? 'Regenerate related content' : 'Generate related content'}
        onPress={() => void generate()}
        disabled={!privacyAccepted || checkingAvailability || loading || !photoUri}
        variant="outline"
      />
      {checkingAvailability && <ActivityIndicator accessibilityLabel="Checking AI service availability" color={Colors.primary} style={styles.spinner} />}
      {loading && <ActivityIndicator accessibilityLabel="Analyzing photo and generating report" color={Colors.primary} style={styles.spinner} />}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {generation && imageAnalysis && (
        <View style={styles.results} accessibilityLiveRegion="polite">
          <Text accessibilityRole="alert" style={styles.success}>Photo analyzed. Suggestions are ready for your review.</Text>
          <Text style={styles.notice}>Suggested report title and description have been filled into the form. Review and edit them before submitting.</Text>
          <Text style={styles.analysisLabel}>Visible evidence: {imageAnalysis.visible_evidence.join('; ') || 'No specific visible evidence identified.'}</Text>
          {imageAnalysis.uncertainties.length > 0 && (
            <Text style={styles.notice}>Uncertainty: {imageAnalysis.uncertainties.join('; ')}</Text>
          )}
          {imageAnalysis.needs_review && (
            <Text style={styles.notice}>The photo is unclear or the issue is uncertain. Review the evidence carefully and correct anything inaccurate.</Text>
          )}
          <Text style={styles.fieldLabel}>Suggested report title</Text>
          <TextInput
            accessibilityLabel="AI-generated title draft"
            value={generation.content.title}
            onChangeText={(value) => setGeneration((current) => current
              ? { ...current, titleApplied: false, content: { ...current.content, title: value } }
              : current)}
            maxLength={100}
            style={styles.suggestionInput}
          />
          <Button
            title={generation.titleApplied ? 'Used successfully' : 'Use suggested title'}
            onPress={applyTitle}
            disabled={generation.content.title.trim().length < 10}
            variant="outline"
          />
          <Text style={styles.fieldLabel}>Suggested report description</Text>
          <TextInput
            accessibilityLabel="AI-generated description draft"
            value={generation.content.description}
            onChangeText={(value) => setGeneration((current) => current
              ? { ...current, descriptionApplied: false, content: { ...current.content, description: value } }
              : current)}
            maxLength={500}
            multiline
            style={[styles.suggestionInput, styles.descriptionInput]}
          />
          <Button
            title={generation.descriptionApplied ? 'Used successfully' : 'Use suggested description'}
            onPress={applyDescription}
            disabled={!generation.content.description.trim()}
            variant="outline"
          />
          {generation.content.category_suggestion
            && (generation.content.category_suggestion !== category || generation.categoryApplied) && (
            <View>
              <Text style={styles.fieldLabel}>Category suggestion: {generation.content.category_suggestion.replace(/_/g, ' ')}</Text>
              <Button
                title={generation.categoryApplied ? 'Used successfully' : 'Use suggested category'}
                onPress={applyCategory}
                variant="outline"
              />
            </View>
          )}
          <Text style={styles.fieldLabel}>Separate issue summary (editable; long-press to copy)</Text>
          <TextInput
            accessibilityLabel="AI-generated summary"
            value={generation.content.summary}
            onChangeText={(value) => setGeneration((current) => current
              ? { ...current, content: { ...current.content, summary: value } }
              : current)}
            maxLength={300}
            multiline
            selectTextOnFocus
            style={[styles.suggestionInput, styles.descriptionInput]}
          />
          <Text style={styles.fieldLabel}>Optional public-awareness caption (not submitted as report description)</Text>
          <TextInput
            accessibilityLabel="AI-generated awareness caption"
            value={generation.content.awareness_caption}
            onChangeText={(value) => setGeneration((current) => current
              ? { ...current, content: { ...current.content, awareness_caption: value } }
              : current)}
            maxLength={500}
            multiline
            selectTextOnFocus
            style={[styles.suggestionInput, styles.descriptionInput]}
          />
          <Text style={styles.fieldLabel}>Hashtags (editable; long-press to copy)</Text>
          <TextInput
            accessibilityLabel="AI-generated hashtags"
            value={generation.content.hashtags.join(' ')}
            onChangeText={(value) => setGeneration((current) => current
              ? {
                ...current,
                content: {
                  ...current.content,
                  hashtags: value.split(/\s+/).filter(Boolean).slice(0, 8),
                },
              }
              : current)}
            selectTextOnFocus
            style={styles.suggestionInput}
          />
          {generation.content.clarification_question && (
            <Text style={styles.notice}>Consider adding this detail: {generation.content.clarification_question}</Text>
          )}
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
  retry: { color: Colors.primary, fontWeight: '600', paddingVertical: 8 },
  configItem: { color: Colors.textMain, fontSize: 13, marginTop: 4 },
  configHelp: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 8 },
  success: { color: '#047857', fontWeight: '700', fontSize: 14 },
  results: { marginTop: 14, gap: 8 },
  analysisLabel: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19 },
  fieldLabel: { color: Colors.textMain, fontWeight: '600', marginTop: 8 },
  suggestion: { color: Colors.textMain, fontSize: 14, lineHeight: 20 },
  suggestionInput: { color: Colors.textMain, fontSize: 14, lineHeight: 20, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm, padding: 10 },
  descriptionInput: { minHeight: 110, textAlignVertical: 'top' },
});
