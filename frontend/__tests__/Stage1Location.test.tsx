import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Stage1CameraScreen from '../screens/reporting/Stage1CameraScreen';

const mockRequestLocation = jest.fn();
const mockOpenLocationSettings = jest.fn();
let mockLocationState = {
  coords: null as { lat: number; lng: number } | null,
  address: '',
  accuracy: undefined as number | undefined,
  permissionStatus: 'granted',
  canAskAgain: true,
  loading: false,
  error: null as string | null,
  requestLocation: mockRequestLocation,
  openLocationSettings: mockOpenLocationSettings,
};
const mockLaunchImageLibraryAsync = jest.fn();

jest.mock('../hooks/useLiveLocation', () => ({
  useLiveLocation: () => mockLocationState,
}));
jest.mock('expo-camera', () => ({
  CameraView: require('react-native').View,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));
jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibraryAsync(...args),
}));
jest.mock('expo-constants', () => ({ isDevice: true }));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

describe('Stage1CameraScreen location', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocationState = {
      coords: null,
      address: '',
      accuracy: undefined,
      permissionStatus: 'granted',
      canAskAgain: true,
      loading: false,
      error: null,
      requestLocation: mockRequestLocation,
      openLocationSettings: mockOpenLocationSettings,
    };
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///evidence.jpg' }],
    });
  });

  it('requests location automatically after photo selection and passes the captured address and coordinates onward', async () => {
    const onContinue = jest.fn();
    const onLocationUpdate = jest.fn();
    const screen = render(
      <Stage1CameraScreen onContinue={onContinue} onLocationUpdate={onLocationUpdate} />
    );

    await act(async () => {
      fireEvent.press(screen.getByText('📷 Gallery'));
      await Promise.resolve();
    });
    await waitFor(() => expect(mockRequestLocation).toHaveBeenCalledTimes(1));

    mockLocationState = {
      ...mockLocationState,
      coords: { lat: 19.076, lng: 72.8777 },
      address: 'Central Mumbai',
      accuracy: 18,
    };
    screen.rerender(
      <Stage1CameraScreen onContinue={onContinue} onLocationUpdate={onLocationUpdate} />
    );

    await waitFor(() => expect(onLocationUpdate).toHaveBeenCalledWith(
      { lat: 19.076, lng: 72.8777 },
      'Central Mumbai',
      18,
    ));
    fireEvent.press(screen.getByText('Continue (1/3)'));
    expect(onContinue).toHaveBeenCalledWith(
      ['file:///evidence.jpg'],
      { lat: 19.076, lng: 72.8777 },
      'Central Mumbai',
      18,
    );
  });

  it('does not request location repeatedly when adding another photo', async () => {
    const screen = render(
      <Stage1CameraScreen onContinue={jest.fn()} onLocationUpdate={jest.fn()} />
    );
    mockLaunchImageLibraryAsync
      .mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///first.jpg' }] })
      .mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///second.jpg' }] });

    await act(async () => {
      fireEvent.press(screen.getByText('📷 Gallery'));
      await Promise.resolve();
    });
    await waitFor(() => expect(mockRequestLocation).toHaveBeenCalledTimes(1));

    await act(async () => {
      fireEvent.press(screen.getByText('📷 Gallery'));
      await Promise.resolve();
    });
    expect(mockRequestLocation).toHaveBeenCalledTimes(1);
  });
});
