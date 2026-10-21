import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Stage2DetailsScreen from '../screens/reporting/Stage2DetailsScreen';
import { getAuthorityRecommendations } from '../lib/authorityRecommendations';

jest.mock('../components/reporting/ReportAiAssistance', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../lib/authorityRecommendations', () => ({
  emptyAuthorityRecommendations: jest.fn(() => ({
    accounts: [],
    departments: ['Municipal public works or roads department'],
    unverifiedDirectoryMatches: false,
  })),
  getAuthorityRecommendations: jest.fn().mockResolvedValue({
    accounts: [],
    departments: ['Municipal public works or roads department'],
    unverifiedDirectoryMatches: false,
  }),
}));

const gpsCoords = { lat: 19.076, lng: 72.8777 };

function fillRequiredFields(
  screen: ReturnType<typeof render>
) {
  fireEvent.changeText(
    screen.getByPlaceholderText('Short factual title (10–100 characters)'),
    'Pothole outside the community center'
  );
  fireEvent.changeText(
    screen.getByPlaceholderText('Describe only what you observed'),
    'A pothole is visible in the road surface.'
  );
}

describe('Stage2DetailsScreen location confirmation', () => {
  it('restores saved report details and selections when returning to edit', async () => {
    const authority = {
      id: 'authority-1',
      name: 'Verified Municipal Corporation',
      handle: '@VerifiedCivic',
      confidence: 0.8,
      matchReason: 'City + Category match',
      sourceUrl: 'https://example.gov',
      verificationStatus: 'verified' as const,
    };
    jest.mocked(getAuthorityRecommendations).mockResolvedValueOnce({
      accounts: [authority],
      departments: [],
      unverifiedDirectoryMatches: false,
    });
    const screen = render(
      <Stage2DetailsScreen
        photos={['file:///evidence.jpg']}
        initialTitle="Overflowing roadside waste"
        initialCategory="garbage"
        initialDescription="Mixed waste is visible beside the road."
        initialAddress="Alandi, Maharashtra"
        coords={gpsCoords}
        initialLocationSource="manual"
        initialSelectedAuthorityHandles={[authority.handle]}
        initialAuthoritySuggestions={[authority]}
        requestId="restore-report"
        onImageReferenceChange={jest.fn()}
        onGeneratedReportContent={jest.fn()}
        onContinue={jest.fn()}
        onBack={jest.fn()}
      />
    );

    expect(screen.getByPlaceholderText('Short factual title (10–100 characters)').props.value)
      .toBe('Overflowing roadside waste');
    expect(screen.getByPlaceholderText('Describe only what you observed').props.value)
      .toBe('Mixed waste is visible beside the road.');
    expect(screen.getByText('🗑️ Garbage')).toBeTruthy();
    expect(screen.getByText('Coordinates entered manually')).toBeTruthy();
    await waitFor(() => expect(
      screen.getByLabelText('Select Verified Municipal Corporation account @VerifiedCivic').props.accessibilityState
    ).toEqual({ checked: true }));
  });

  it('enables confirmation after the report title, visible details, and address are provided', () => {
    const onContinue = jest.fn();
    const screen = render(
      <Stage2DetailsScreen
        photos={['file:///evidence.jpg']}
        initialAddress="Central Mumbai"
        coords={gpsCoords}
        onContinue={onContinue}
        onBack={jest.fn()}
      />
    );
    expect(screen.getByText(/Enter a title of at least 10 characters/)).toBeTruthy();
    fireEvent.press(screen.getByText('Confirm & Continue'));
    expect(onContinue).not.toHaveBeenCalled();

    fillRequiredFields(screen);
    expect(screen.queryByText(/Enter a title of at least 10 characters/)).toBeNull();
    fireEvent.press(screen.getByText('Confirm & Continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('keeps an empty location editor open until the user enters a report address', () => {
    const onContinue = jest.fn();
    const screen = render(
      <Stage2DetailsScreen
        photos={['file:///evidence.jpg']}
        initialAddress=""
        coords={null}
        onContinue={onContinue}
        onBack={jest.fn()}
      />
    );

    expect(screen.getByText(/Enter a street, landmark, or city\/state in Location confirmation/)).toBeTruthy();
    fireEvent.press(screen.getByText('Done'));
    expect(screen.getByPlaceholderText('Street, landmark, city and state')).toBeTruthy();
    expect(screen.getByText(/No GPS coordinates; enter a manual address/)).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText('Street, landmark, city and state'), 'Central Mumbai');
    fireEvent.press(screen.getByText('Done'));
    expect(screen.queryByPlaceholderText('Street, landmark, city and state')).toBeNull();
    expect(screen.queryByText(/Enter a street, landmark, or city\/state in Location confirmation/)).toBeNull();

    fillRequiredFields(screen);
    fireEvent.press(screen.getByText('Confirm & Continue'));
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ address: 'Central Mumbai' }));
  });

  it('preserves GPS provenance and accuracy when detected coordinates are unchanged', () => {
    const onContinue = jest.fn();
    const screen = render(
      <Stage2DetailsScreen
        photos={['file:///evidence.jpg']}
        initialAddress="Central Mumbai"
        coords={gpsCoords}
        accuracy={18}
        onContinue={onContinue}
        onBack={jest.fn()}
      />
    );
    fillRequiredFields(screen);
    fireEvent.press(screen.getByText('Confirm & Continue'));

    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({
      coords: gpsCoords,
      locationAccuracy: 18,
      locationSource: 'gps',
      locationConfirmed: true,
    }));
  });

  it('marks edited coordinates as manual and drops the detected GPS accuracy', () => {
    const onContinue = jest.fn();
    const screen = render(
      <Stage2DetailsScreen
        photos={['file:///evidence.jpg']}
        initialAddress="Central Mumbai"
        coords={gpsCoords}
        accuracy={18}
        onContinue={onContinue}
        onBack={jest.fn()}
      />
    );
    fireEvent.press(screen.getByText('Edit'));
    fireEvent.changeText(screen.getByPlaceholderText('Latitude (optional)'), '19.08');
    fillRequiredFields(screen);
    fireEvent.press(screen.getByText('Confirm & Continue'));

    expect(screen.getByText('Coordinates entered manually')).toBeTruthy();
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({
      coords: { lat: 19.08, lng: gpsCoords.lng },
      locationAccuracy: undefined,
      locationSource: 'manual',
    }));
  });

  it('confirms a manual address without requiring optional GPS coordinates', () => {
    const onContinue = jest.fn();
    const screen = render(
      <Stage2DetailsScreen
        photos={['file:///evidence.jpg']}
        initialAddress=""
        coords={null}
        onContinue={onContinue}
        onBack={jest.fn()}
      />
    );
    fireEvent.changeText(screen.getByPlaceholderText('Street, landmark, city and state'), 'Central Mumbai');
    fillRequiredFields(screen);
    fireEvent.press(screen.getByText('Confirm & Continue'));

    expect(screen.getByText('No GPS coordinates; this address is manually confirmed')).toBeTruthy();
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({
      address: 'Central Mumbai',
      coords: null,
      locationAccuracy: undefined,
      locationSource: 'manual',
      locationConfirmed: true,
    }));
  });

  it('lets the user select and remove verified authority suggestions', async () => {
    jest.mocked(getAuthorityRecommendations).mockResolvedValue({
      accounts: [{
        id: 'authority-1',
        name: 'Verified Municipal Corporation',
        handle: '@VerifiedCivic',
        confidence: 0.8,
        matchReason: 'City + Category match',
        sourceUrl: 'https://example.gov',
        verificationStatus: 'verified',
      }],
      departments: ['Municipal public works or roads department'],
      unverifiedDirectoryMatches: false,
    });
    const onContinue = jest.fn();
    const screen = render(
      <Stage2DetailsScreen
        photos={['file:///evidence.jpg']}
        initialAddress="Mumbai, Maharashtra"
        coords={gpsCoords}
        onContinue={onContinue}
        onBack={jest.fn()}
      />
    );
    await waitFor(() => expect(screen.getByLabelText('Select Verified Municipal Corporation account @VerifiedCivic')).toBeTruthy());
    const suggestion = screen.getByLabelText('Select Verified Municipal Corporation account @VerifiedCivic');
    fireEvent.press(suggestion);
    expect(suggestion.props.accessibilityState).toEqual({ checked: true });
    fireEvent.press(suggestion);
    expect(suggestion.props.accessibilityState).toEqual({ checked: false });
    fillRequiredFields(screen);
    fireEvent.press(screen.getByText('Confirm & Continue'));

    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({
      selectedAuthorityHandles: [],
    }));
  });

  it('does not carry selected authority suggestions across a location change', async () => {
    jest.mocked(getAuthorityRecommendations)
      .mockResolvedValueOnce({
        accounts: [{
          id: 'authority-1',
          name: 'Verified Municipal Corporation',
          handle: '@VerifiedCivic',
          confidence: 0.8,
          matchReason: 'City + Category match',
          verificationStatus: 'verified',
        }],
        departments: ['Municipal public works or roads department'],
        unverifiedDirectoryMatches: false,
      })
      .mockImplementationOnce(() => new Promise(() => undefined));
    const onContinue = jest.fn();
    const screen = render(
      <Stage2DetailsScreen
        photos={['file:///evidence.jpg']}
        initialAddress="Mumbai, Maharashtra"
        coords={gpsCoords}
        onContinue={onContinue}
        onBack={jest.fn()}
      />
    );
    const suggestion = await screen.findByLabelText('Select Verified Municipal Corporation account @VerifiedCivic');
    fireEvent.press(suggestion);
    fillRequiredFields(screen);
    fireEvent.press(screen.getByText('Edit'));
    fireEvent.changeText(screen.getByPlaceholderText('Street, landmark, city and state'), 'Pune, Maharashtra');
    fireEvent.press(screen.getByText('Confirm & Continue'));

    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({
      selectedAuthorityHandles: [],
      authoritySuggestions: [],
    }));
  });

  it('normalizes the manually confirmed address before continuing', () => {
    const onContinue = jest.fn();
    const screen = render(
      <Stage2DetailsScreen
        photos={['file:///evidence.jpg']}
        initialAddress=""
        coords={null}
        onContinue={onContinue}
        onBack={jest.fn()}
      />
    );
    fireEvent.changeText(screen.getByPlaceholderText('Street, landmark, city and state'), '  Central\n  Mumbai ');
    fillRequiredFields(screen);
    fireEvent.press(screen.getByText('Confirm & Continue'));
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ address: 'Central Mumbai' }));
  });

  it('does not continue with a location address that exceeds the database limit', () => {
    const onContinue = jest.fn();
    const screen = render(
      <Stage2DetailsScreen
        photos={['file:///evidence.jpg']}
        initialAddress=""
        coords={null}
        onContinue={onContinue}
        onBack={jest.fn()}
      />
    );
    fireEvent.changeText(screen.getByPlaceholderText('Street, landmark, city and state'), 'x'.repeat(301));
    fillRequiredFields(screen);
    fireEvent.press(screen.getByText('Confirm & Continue'));
    expect(onContinue).not.toHaveBeenCalled();
  });
});
