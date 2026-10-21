/**
 * Report Issue Screen - 5-Stage Flow Orchestrator
 * PRD Section 5.2 - Complete Reporting Flow
 *
 * State Machine:
 * Stage 1 (Camera) → Stage 2 (Details) → Stage 3 (Privacy)
 * → Stage 4 (Preview) → Stage 5 (Success)
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { ReportSharingMethod, CategoryKey } from '../types';
import { createIssue } from '../hooks/useIssues';
import { MatchedAuthority } from '../lib/smartAuthorities';
import { GeneratedReportContent } from '../lib/reportContentSchema';
import { deletePhoto, uploadPhotos } from '../lib/storage';
import { composePostText, shareToTwitter, showShareDialog } from '../lib/sharingEnhanced';
import { clearReportDraft, saveReportDraft } from '../lib/reportDrafts';
import * as Crypto from 'expo-crypto';

// Import all 5 stage screens
import Stage1CameraScreen from './reporting/Stage1CameraScreen';
import Stage2DetailsScreen from './reporting/Stage2DetailsScreen';
import Stage3PrivacyScreen from './reporting/Stage3PrivacyScreen';
import Stage4PreviewScreen from './reporting/Stage4PreviewScreen';
import Stage5SuccessScreen from './reporting/Stage5SuccessScreen';
import BlueskyShareModal from '../components/reporting/BlueskyShareModal';

type Stage = 1 | 2 | 3 | 4 | 5;

interface ReportData {
  // Stage 1
  photos: string[];
  coords: { lat: number; lng: number } | null;
  address: string;
  locationAccuracy?: number;
  locationSource?: 'gps' | 'manual';
  locationConfirmed?: boolean;
  selectedAuthorityHandles: string[];
  authoritySuggestions: MatchedAuthority[];
  generatedReportContents: { generationId: string; content: GeneratedReportContent }[];
  clientRequestId: string;
  aiImageReference?: string;
  aiImageUri?: string;

  // Stage 2
  title?: string;
  category?: CategoryKey;
  description?: string;

  // Stage 3
  privacy?: ReportSharingMethod;
  rememberChoice?: boolean;

  // Stage 4/5
  issueId?: string;
  tweetUrl?: string;
  externalComposerOpened?: boolean;
}

export default function ReportIssueScreenV2() {
  const navigation = useNavigation();
  const { session } = useAuth();

  const [currentStage, setCurrentStage] = useState<Stage>(1);
  const [blueskyShareVisible, setBlueskyShareVisible] = useState(false);
  const [reportData, setReportData] = useState<ReportData>({
    photos: [],
    coords: null,
    address: '',
    selectedAuthorityHandles: [],
    authoritySuggestions: [],
    generatedReportContents: [],
    clientRequestId: Crypto.randomUUID(),
  });
  const submitting = useRef(false);
  const submittedIssueId = useRef<string | null>(null);

  useEffect(() => {
    if (currentStage < 5) void saveReportDraft({ currentStage, reportData });
  }, [currentStage, reportData]);

  useEffect(() => navigation.addListener('beforeRemove', () => {
    if (reportData.aiImageReference && !submittedIssueId.current) {
      void deletePhoto(reportData.aiImageReference);
    }
  }), [navigation, reportData.aiImageReference]);

  // Stage 1: Camera -> Stage 2: Details
  const handleStage1Complete = (
    photos: string[],
    coords: { lat: number; lng: number } | null,
    address: string,
    accuracy?: number
  ) => {
    setReportData((current) => ({ ...current, photos, coords, address, locationAccuracy: accuracy }));
    setCurrentStage(2);
  };

  // Stage 2: Details -> Stage 3: Privacy
  const handleStage2Complete = (data: {
    title: string;
    category: CategoryKey;
    description: string;
    address: string;
    coords: { lat: number; lng: number } | null;
    locationAccuracy?: number;
    locationSource: 'gps' | 'manual';
    locationConfirmed: true;
    selectedAuthorityHandles: string[];
    authoritySuggestions: MatchedAuthority[];
  }) => {
    setReportData((current) => ({ ...current, ...data }));
    setCurrentStage(3);
  };

  const handleGeneratedReportContent = (content: GeneratedReportContent) => {
    setReportData((current) => ({
      ...current,
      generatedReportContents: [
        ...current.generatedReportContents,
        { generationId: Crypto.randomUUID(), content },
      ],
    }));
  };

  const handleAiImageReferenceChange = (reference?: string, photoUri?: string) => {
    setReportData((current) => ({
      ...current,
      aiImageReference: reference,
      aiImageUri: photoUri,
    }));
  };

  // Stage 3: Privacy -> Stage 4: Preview
  const handleStage3Complete = (privacyChoice: {
    method: ReportSharingMethod;
    rememberChoice: boolean;
  }) => {
    setReportData({
      ...reportData,
      privacy: privacyChoice.method,
      rememberChoice: privacyChoice.rememberChoice,
    });
    setCurrentStage(4);
  };

  // Stage 4: Preview -> Submit -> Stage 5: Success
  const handleStage4Submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    try {
      if (__DEV__) console.log('[Report] Starting submission...');

      // Validate required fields
      if (!reportData.title || !reportData.category || !reportData.description) {
        throw new Error('Title, category and description are required.');
      }
      if (reportData.photos.length === 0) throw new Error('At least one evidence photo is required.');
      if (!reportData.locationConfirmed || !reportData.address.trim()) throw new Error('Confirm the report location before submitting.');

      // Step 1: Upload photos to Supabase Storage
      if (__DEV__) console.log('[Report] Uploading photos...');
      const isPrivateReport = reportData.privacy === 'none';
      const reusableAiImage = isPrivateReport
        && reportData.aiImageReference
        && reportData.aiImageUri === reportData.photos[0]
        ? reportData.aiImageReference
        : undefined;
      const photoUrls = reusableAiImage
        ? [
          reusableAiImage,
          ...(reportData.photos.length > 1
            ? await uploadPhotos(
              reportData.photos.slice(1),
              'issues',
              true,
              `${reportData.clientRequestId}-remaining`,
              true
            )
            : []),
        ]
        : await uploadPhotos(
          reportData.photos,
          'issues',
          true,
          reportData.clientRequestId,
          isPrivateReport
        );

      // Step 2: Create issue in database
      if (__DEV__) console.log('[Report] Creating issue in database...');
      const issueData = await createIssue({
        client_request_id: reportData.clientRequestId,
        user_id: session?.user?.id,
        title: reportData.title,
        description: reportData.description || '',
        category: reportData.category,
        photos: photoUrls,
        lat: reportData.coords?.lat,
        lng: reportData.coords?.lng,
        address: reportData.address,
        location_accuracy_m: reportData.locationAccuracy,
        location_source: reportData.locationSource || 'manual',
        location_confirmed: true,
        privacy: reportData.privacy === 'none' ? 'none' : 'twitter',
        authorities: reportData.selectedAuthorityHandles,
        authority_suggestions: reportData.authoritySuggestions,
        generated_contents: reportData.generatedReportContents,
      });
      submittedIssueId.current = issueData.id;
      if (!isPrivateReport && reportData.aiImageReference) {
        await deletePhoto(reportData.aiImageReference);
      }

      // Step 3: Share to Twitter via deep link (if user chose Twitter sharing)
      let externalComposerOpened = false;
      if (reportData.privacy === 'twitter') {
        if (__DEV__) console.log('[Report] Opening Twitter for sharing...');
        const tweetText = composePostText({
          title: reportData.title!,
          description: reportData.description,
          address: reportData.address,
          lat: reportData.coords?.lat,
          lng: reportData.coords?.lng,
          authorities: reportData.selectedAuthorityHandles,
          category: reportData.category,
        });
        externalComposerOpened = await shareToTwitter({ text: tweetText });
        if (!externalComposerOpened) throw new Error('The X/Twitter composer could not be opened. Your report was saved in the app.');
      }

      // Update report data with submission results
      setReportData({
        ...reportData,
        issueId: issueData.id,
        title: issueData.title,
        description: issueData.description,
        photos: photoUrls,
        externalComposerOpened,
      });

      if (__DEV__) console.log('[Report] Submission successful!');
      await clearReportDraft();
      setCurrentStage(5);
    } catch (error: any) {
      console.error('[Report] Submission error:', error);
      Alert.alert(
        'Submission Failed',
        error.message || 'Failed to submit your report. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      submitting.current = false;
    }
  };

  // Navigation handlers
  const handleBack = (targetStage: Stage) => {
    setCurrentStage(targetStage);
  };

  const handleViewPost = () => {
    // Navigate to issue detail screen
    // @ts-ignore
    navigation.navigate('Home', {
      screen: 'Feed',
      params: { issueId: reportData.issueId },
    });
  };

  const handleShareMore = () => {
    const tweetText = composePostText({
      title: reportData.title || '',
      description: reportData.description,
      address: reportData.address,
      lat: reportData.coords?.lat,
      lng: reportData.coords?.lng,
      category: reportData.category,
    });
    showShareDialog(
      { text: tweetText, imageUri: reportData.photos[0] },
      undefined,
      () => setBlueskyShareVisible(true)
    );
  };

  const handleDone = () => {
    // Reset and go back to feed
    submittedIssueId.current = null;
    setCurrentStage(1);
    setBlueskyShareVisible(false);
    setReportData({
      photos: [],
      coords: null,
      address: '',
      selectedAuthorityHandles: [],
      authoritySuggestions: [],
      generatedReportContents: [],
      clientRequestId: Crypto.randomUUID(),
    });
    // @ts-ignore
    navigation.navigate('Home');
  };

  // Render current stage
  return (
    <View style={{ flex: 1 }}>
      {currentStage === 1 && (
        <Stage1CameraScreen
          onContinue={handleStage1Complete}
          onCancel={() => navigation.goBack()}
        />
      )}

      {currentStage === 2 && (
        <Stage2DetailsScreen
          photos={reportData.photos}
          initialTitle={reportData.title || ''}
          initialCategory={reportData.category || 'pothole'}
          initialDescription={reportData.description || ''}
          initialAddress={reportData.address}
          coords={reportData.coords}
          accuracy={reportData.locationAccuracy}
          initialLocationSource={reportData.locationSource}
          initialSelectedAuthorityHandles={reportData.selectedAuthorityHandles}
          initialAuthoritySuggestions={reportData.authoritySuggestions}
          requestId={reportData.clientRequestId}
          savedImageReference={reportData.aiImageReference}
          savedImageUri={reportData.aiImageUri}
          onImageReferenceChange={handleAiImageReferenceChange}
          onContinue={handleStage2Complete}
          onGeneratedReportContent={handleGeneratedReportContent}
          onBack={() => handleBack(1)}
        />
      )}

      {currentStage === 3 && (
        <Stage3PrivacyScreen
          onContinue={handleStage3Complete}
          onBack={() => handleBack(2)}
          defaultMethod={reportData.privacy}
        />
      )}

      {currentStage === 4 && (
        <Stage4PreviewScreen
          photos={reportData.photos}
          title={reportData.title || ''}
          description={reportData.description || ''}
          category={reportData.category || 'other'}
          address={reportData.address}
          coords={reportData.coords}
          selectedAuthorityHandles={reportData.selectedAuthorityHandles}
          authoritySuggestions={reportData.authoritySuggestions}
          privacy={reportData.privacy || 'twitter'}
          onSubmit={handleStage4Submit}
          onBack={() => handleBack(3)}
          onEditDetails={() => handleBack(2)}
          onEditPrivacy={() => handleBack(3)}
        />
      )}

      {currentStage === 5 && (
        <Stage5SuccessScreen
          issueId={reportData.issueId || ''}
          privacy={reportData.privacy === 'none' ? 'none' : 'twitter'}
          title={reportData.title || ''}
          description={reportData.description || ''}
          photoUri={reportData.photos[0]}
          tweetUrl={reportData.tweetUrl}
          externalComposerOpened={reportData.externalComposerOpened}
          onViewPost={handleViewPost}
          onShareMore={handleShareMore}
          onDone={handleDone}
        />
      )}
      {currentStage === 5 && reportData.issueId && (
        <BlueskyShareModal
          visible={blueskyShareVisible}
          issueId={reportData.issueId}
          title={reportData.title || ''}
          description={reportData.description || ''}
          photoUri={reportData.photos[0]}
          onClose={() => setBlueskyShareVisible(false)}
        />
      )}
    </View>
  );
}
