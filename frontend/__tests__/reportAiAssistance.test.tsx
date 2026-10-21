import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ReportAiAssistance from '../components/reporting/ReportAiAssistance';
import { getReportContentCapabilities, requestReportContent } from '../lib/reportAssistance';
import { parseReportContentResponse, validateReportContentInput } from '../lib/reportContentSchema';
import { uploadPhoto } from '../lib/storage';

jest.mock('../lib/reportAssistance', () => ({
  getReportContentCapabilities: jest.fn(),
  requestReportContent: jest.fn(),
}));
jest.mock('../lib/backend', () => ({ getBackend: () => 'supabase' }));
jest.mock('../lib/supabase', () => ({ isSupabaseConfigured: true }));
jest.mock('../lib/storage', () => ({
  uploadPhoto: jest.fn().mockResolvedValue('supabase-storage://private-issue-photos/user/issues/request-ai.jpg'),
  deletePhoto: jest.fn().mockResolvedValue(undefined),
}));

const content = {
  title: 'Reported road surface damage',
  description: 'A damaged section of road is visible in the report.',
  summary: 'A road surface issue was reported.',
  awareness_caption: 'Please review this reported road surface issue.',
  hashtags: ['#CivicVigilance'],
  category_suggestion: null,
  clarification_question: null,
};
const generated = {
  content,
  analysis: {
    issue_category: 'pothole',
    description: 'A damaged section of road surface is visible.',
    visible_evidence: ['A damaged road surface'],
    confidence: 0.9,
    needs_review: false,
    uncertainties: [],
  },
};

describe('report AI assistance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getReportContentCapabilities).mockResolvedValue({
      available: true,
      missing: [],
      invalid: [],
    });
  });

  it('requires consent, generates image-grounded content, and fills the report form', async () => {
    jest.mocked(requestReportContent).mockResolvedValue(generated);
    const onUseTitle = jest.fn();
    const onUseDescription = jest.fn();
    const onImageReferenceChange = jest.fn();
    const screen = render(
      <ReportAiAssistance
        photos={['file:///evidence.jpg']}
        title=""
        category="pothole"
        description="A pothole is visible in the road surface."
        requestId="request"
        onImageReferenceChange={onImageReferenceChange}
        onGenerated={jest.fn()}
        onUseTitle={onUseTitle}
        onUseDescription={onUseDescription}
        onUseCategory={jest.fn()}
      />
    );

    fireEvent.press(screen.getByRole('button', { name: 'Generate related content' }));
    expect(requestReportContent).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Consent to send the selected photo and report details for AI assistance'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Generate related content' }).props.accessibilityState.disabled).toBe(false);
    });
    fireEvent.press(screen.getByRole('button', { name: 'Generate related content' }));
    await waitFor(() => expect(screen.getByText('Photo analyzed. Suggestions are ready for your review.')).toBeTruthy());
    expect(screen.getByLabelText('AI-generated title draft').props.value).toBe(content.title);
    expect(screen.getByLabelText('AI-generated description draft').props.value).toBe(content.description);
    expect(screen.getByLabelText('AI-generated summary').props.value).toBe(content.summary);
    expect(screen.getByLabelText('AI-generated awareness caption').props.value).toBe(content.awareness_caption);
    expect(screen.getByLabelText('AI-generated hashtags').props.value).toBe(content.hashtags.join(' '));
    expect(requestReportContent).toHaveBeenCalledWith(
      { title: '', category: 'pothole', description: 'A pothole is visible in the road surface.' },
      'supabase-storage://private-issue-photos/user/issues/request-ai.jpg',
      true,
      'request'
    );
    expect(onImageReferenceChange).toHaveBeenCalledWith(
      'supabase-storage://private-issue-photos/user/issues/request-ai.jpg',
      'file:///evidence.jpg'
    );
    expect(onUseTitle).toHaveBeenCalledWith(content.title);
    expect(onUseDescription).toHaveBeenCalledWith(content.description);

    fireEvent.changeText(screen.getByLabelText('AI-generated title draft'), 'Edited title draft');
    fireEvent.press(screen.getByRole('button', { name: 'Use suggested title' }));
    expect(onUseTitle).toHaveBeenCalledWith('Edited title draft');
    expect(screen.getByRole('button', { name: 'Used successfully' })).toBeTruthy();

    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Replace description')?.onPress?.();
    });
    fireEvent.changeText(screen.getByLabelText('AI-generated description draft'), 'Edited description draft.');
    fireEvent.press(screen.getByRole('button', { name: 'Use suggested description' }));
    expect(onUseDescription).toHaveBeenCalledWith('Edited description draft.');
    expect(screen.getAllByRole('button', { name: 'Used successfully' })).toHaveLength(2);
  });

  it('surfaces provider unavailability without blocking manual reporting', async () => {
    jest.mocked(getReportContentCapabilities).mockResolvedValue({
      available: false,
      missing: ['AI_VISION_ENDPOINT', 'AI_VISION_API_KEY', 'AI_TEXT_ENDPOINT', 'AI_TEXT_API_KEY'],
      invalid: [],
    });
    const screen = render(
      <ReportAiAssistance
        photos={['file:///evidence.jpg']}
        title=""
        category="pothole"
        description="A damaged road surface is visible."
        requestId="request"
        onImageReferenceChange={jest.fn()}
        onGenerated={jest.fn()}
        onUseTitle={jest.fn()}
        onUseDescription={jest.fn()}
        onUseCategory={jest.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText(/The photo-based AI service isn’t configured correctly on the backend/)).toBeTruthy());
    expect(screen.getByText('Missing: AI_VISION_ENDPOINT')).toBeTruthy();
    expect(screen.getByText('Missing: AI_TEXT_API_KEY')).toBeTruthy();
    expect(getReportContentCapabilities).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText('Check backend configuration again'));
    await waitFor(() => expect(getReportContentCapabilities).toHaveBeenCalledTimes(2));
    fireEvent.press(screen.getByLabelText('Consent to send the selected photo and report details for AI assistance'));
    const generateButton = screen.getByRole('button', { name: 'Generate related content' });
    expect(generateButton.props.accessibilityState.disabled).toBe(false);
    fireEvent.press(generateButton);
    expect(await screen.findByText(/AI generation cannot start yet/)).toBeTruthy();
    expect(screen.getByText(/AI_VISION_ENDPOINT, AI_VISION_API_KEY, AI_TEXT_ENDPOINT, AI_TEXT_API_KEY/)).toBeTruthy();
    expect(requestReportContent).not.toHaveBeenCalled();
  });

  it('fills the title and description with generated content immediately', async () => {
    jest.mocked(requestReportContent).mockResolvedValue(generated);
    const onUseTitle = jest.fn();
    const onUseDescription = jest.fn();
    const screen = render(
      <ReportAiAssistance
        photos={['file:///evidence.jpg']}
        title="Pothole reported near the community center"
        category="pothole"
        description="A pothole is visible in the road surface."
        requestId="request"
        onImageReferenceChange={jest.fn()}
        onGenerated={jest.fn()}
        onUseTitle={onUseTitle}
        onUseDescription={onUseDescription}
        onUseCategory={jest.fn()}
      />
    );
    fireEvent.press(screen.getByLabelText('Consent to send the selected photo and report details for AI assistance'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Generate related content' }).props.accessibilityState.disabled).toBe(false);
    });
    fireEvent.press(screen.getByRole('button', { name: 'Generate related content' }));
    await waitFor(() => expect(screen.getByText('Photo analyzed. Suggestions are ready for your review.')).toBeTruthy());
    expect(onUseTitle).toHaveBeenCalledWith(content.title);
    expect(onUseDescription).toHaveBeenCalledWith(content.description);
  });

  it('shows an actionable upload error and retries upload before AI generation', async () => {
    jest.mocked(uploadPhoto)
      .mockRejectedValueOnce(new Error('Could not connect to photo storage. Check your internet connection and try again.'))
      .mockResolvedValueOnce('supabase-storage://private-issue-photos/user/issues/request-ai.jpg');
    jest.mocked(requestReportContent).mockResolvedValue(generated);
    const screen = render(
      <ReportAiAssistance
        photos={['file:///evidence.jpg']}
        title=""
        category="pothole"
        description="A pothole is visible in the road surface."
        requestId="request"
        onImageReferenceChange={jest.fn()}
        onGenerated={jest.fn()}
        onUseTitle={jest.fn()}
        onUseDescription={jest.fn()}
        onUseCategory={jest.fn()}
      />
    );
    fireEvent.press(screen.getByLabelText('Consent to send the selected photo and report details for AI assistance'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Generate related content' }).props.accessibilityState.disabled).toBe(false);
    });

    fireEvent.press(screen.getByRole('button', { name: 'Generate related content' }));
    expect(await screen.findByText(/Could not connect to photo storage/)).toBeTruthy();
    expect(requestReportContent).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Generate related content' }));
    await waitFor(() => expect(screen.getByText('Photo analyzed. Suggestions are ready for your review.')).toBeTruthy());
    expect(uploadPhoto).toHaveBeenCalledTimes(2);
    expect(requestReportContent).toHaveBeenCalledTimes(1);
  });

  it('retries a failed generation without re-uploading the same private photo', async () => {
    jest.mocked(requestReportContent)
      .mockRejectedValueOnce(new Error('Vision provider is temporarily unavailable.'))
      .mockResolvedValueOnce(generated);
    const screen = render(
      <ReportAiAssistance
        photos={['file:///evidence.jpg']}
        title=""
        category="pothole"
        description="A damaged road surface is visible."
        requestId="request"
        onImageReferenceChange={jest.fn()}
        onGenerated={jest.fn()}
        onUseTitle={jest.fn()}
        onUseDescription={jest.fn()}
        onUseCategory={jest.fn()}
      />
    );
    fireEvent.press(screen.getByLabelText('Consent to send the selected photo and report details for AI assistance'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Generate related content' }).props.accessibilityState.disabled).toBe(false);
    });
    fireEvent.press(screen.getByRole('button', { name: 'Generate related content' }));
    await waitFor(() => expect(screen.getByText('Vision provider is temporarily unavailable.')).toBeTruthy());

    fireEvent.press(screen.getByRole('button', { name: 'Generate related content' }));
    await waitFor(() => expect(screen.getByText('Photo analyzed. Suggestions are ready for your review.')).toBeTruthy());
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    expect(requestReportContent).toHaveBeenCalledTimes(2);
  });

  it('discards results when report inputs change while generation is in flight', async () => {
    let resolveGeneration: ((value: typeof generated) => void) | undefined;
    jest.mocked(requestReportContent).mockImplementation(() => new Promise((resolve) => {
      resolveGeneration = resolve;
    }));
    const onGenerated = jest.fn();
    const props = {
      photos: ['file:///evidence.jpg'],
      category: 'pothole' as const,
      description: 'A damaged road surface is visible.',
      requestId: 'request',
      onImageReferenceChange: jest.fn(),
      onGenerated,
      onUseTitle: jest.fn(),
      onUseDescription: jest.fn(),
      onUseCategory: jest.fn(),
    };
    const screen = render(<ReportAiAssistance {...props} title="" />);
    fireEvent.press(screen.getByLabelText('Consent to send the selected photo and report details for AI assistance'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Generate related content' }).props.accessibilityState.disabled).toBe(false);
    });
    fireEvent.press(screen.getByRole('button', { name: 'Generate related content' }));
    await waitFor(() => expect(requestReportContent).toHaveBeenCalled());
    screen.rerender(<ReportAiAssistance {...props} title="Updated title before response" />);
    await waitFor(() => expect(resolveGeneration).toBeDefined());
    if (!resolveGeneration) throw new Error('The generation request did not start.');
    resolveGeneration(generated);

    await waitFor(() => expect(screen.getByText(
      'Your photo or report details changed during generation. Generate suggestions again to use the current details.'
    )).toBeTruthy());
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it('rejects malformed generated responses and validates required source text', async () => {
    expect(() => parseReportContentResponse({ content: { ...content, title: 3 } })).toThrow('invalid response');
    expect(() => parseReportContentResponse({
      content: { ...content, description: 'x'.repeat(501) },
    })).toThrow('invalid response');
    expect(() => parseReportContentResponse({
      content: { ...content, authority_handles: ['@InventedOfficial'] },
    })).toThrow('invalid response');
    expect(() => validateReportContentInput(
      { title: '', category: 'pothole', description: 'short' },
      true
    )).toThrow('at least 10 characters');
    expect(validateReportContentInput(
      { title: '', category: 'pothole', description: '' },
      true,
      true
    )).toEqual({ title: '', category: 'pothole', description: '' });
    expect(() => validateReportContentInput(
      { title: '', category: 'pothole', description: 'A damaged road surface is visible.' },
      false
    )).toThrow('privacy notice');
  });
});
