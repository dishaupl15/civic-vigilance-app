import { fireEvent, render } from '@testing-library/react-native';
import Stage2DetailsScreen from '../screens/reporting/Stage2DetailsScreen';
import { getAuthorityRecommendations } from '../lib/authorityRecommendations';

jest.mock('../lib/authorityRecommendations', () => ({
  getAuthorityRecommendations: jest.fn(() => ({
    accounts: [],
    departments: ['Municipal public works or roads department'],
    unverifiedDirectoryMatches: false,
  })),
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

  it('lets the user select and remove verified authority suggestions', () => {
    jest.mocked(getAuthorityRecommendations).mockReturnValue({
      accounts: [{
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
});
