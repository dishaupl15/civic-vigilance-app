import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ReportAiAssistance from '../components/reporting/ReportAiAssistance';
import { requestReportContent } from '../lib/reportAssistance';
import { parseReportContentResponse, validateReportContentInput } from '../lib/reportContentSchema';

jest.mock('../lib/reportAssistance', () => ({
  requestReportContent: jest.fn(),
}));

const generated = {
  title: 'Reported road surface damage',
  description: 'A damaged section of road is visible in the report.',
  summary: 'A road surface issue was reported.',
  awareness_caption: 'Please review this reported road surface issue.',
  hashtags: ['#CivicVigilance'],
  category_suggestion: null,
  clarification_question: null,
};

describe('report AI assistance', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires consent and never applies generated content automatically', async () => {
    jest.mocked(requestReportContent).mockResolvedValue(generated);
    const onUseTitle = jest.fn();
    const onUseDescription = jest.fn();
    const screen = render(
      <ReportAiAssistance
        title=""
        category="pothole"
        description="A pothole is visible in the road surface."
        onUseTitle={onUseTitle}
        onUseDescription={onUseDescription}
        onUseCategory={jest.fn()}
      />
    );

    fireEvent.press(screen.getByText('Generate related content'));
    expect(requestReportContent).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Consent to send report details for AI writing'));
    fireEvent.press(screen.getByText('Generate related content'));
    await waitFor(() => expect(screen.getByLabelText('AI-generated title draft')).toBeTruthy());
    expect(requestReportContent).toHaveBeenCalledWith(
      { title: '', category: 'pothole', description: 'A pothole is visible in the road surface.' },
      true
    );
    expect(onUseTitle).not.toHaveBeenCalled();
    expect(onUseDescription).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText('AI-generated title draft'), 'Edited draft title');
    fireEvent.press(screen.getByText('Use this title'));
    expect(onUseTitle).toHaveBeenCalledWith('Edited draft title');
  });

  it('surfaces provider unavailability without blocking manual reporting', async () => {
    jest.mocked(requestReportContent).mockRejectedValue(new Error('AI writing assistance is not configured.'));
    const screen = render(
      <ReportAiAssistance
        title=""
        category="pothole"
        description="A damaged road surface is visible."
        onUseTitle={jest.fn()}
        onUseDescription={jest.fn()}
        onUseCategory={jest.fn()}
      />
    );
    fireEvent.press(screen.getByLabelText('Consent to send report details for AI writing'));
    fireEvent.press(screen.getByText('Generate related content'));
    await waitFor(() => expect(screen.getByText('AI writing assistance is not configured.')).toBeTruthy());
  });

  it('rejects malformed generated responses and validates required source text', async () => {
    expect(() => parseReportContentResponse({ content: { ...generated, title: 3 } })).toThrow('invalid response');
    expect(() => parseReportContentResponse({
      content: { ...generated, authority_handles: ['@InventedOfficial'] },
    })).toThrow('invalid response');
    expect(() => validateReportContentInput(
      { title: '', category: 'pothole', description: 'short' },
      true
    )).toThrow('at least 10 characters');
    expect(() => validateReportContentInput(
      { title: '', category: 'pothole', description: 'A damaged road surface is visible.' },
      false
    )).toThrow('privacy notice');
  });
});
