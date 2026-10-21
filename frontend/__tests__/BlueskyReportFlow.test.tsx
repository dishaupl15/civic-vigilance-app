import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import Stage3PrivacyScreen from '../screens/reporting/Stage3PrivacyScreen';
import Stage4PreviewScreen from '../screens/reporting/Stage4PreviewScreen';

jest.mock('../lib/supabase', () => ({ isSupabaseConfigured: true }));

test('selecting Bluesky advances with the official-account sharing choice', () => {
  const onContinue = jest.fn();
  const screen = render(
    <Stage3PrivacyScreen onContinue={onContinue} onBack={jest.fn()} />
  );

  expect(screen.getByText('Publish publicly on Bluesky')).toBeTruthy();
  expect(screen.getByText(/No personal Bluesky login required/)).toBeTruthy();
  fireEvent.press(screen.getByTestId('sharing-option-bluesky'));
  fireEvent.press(screen.getByText('Next: Preview'));

  expect(onContinue).toHaveBeenCalledWith({
    method: 'bluesky',
    rememberChoice: false,
  });
});

test('Bluesky selection shows a sanitized public preview and the selected photo', () => {
  const screen = render(
    <Stage4PreviewScreen
      photos={['file:///evidence.jpg']}
      title="Overflowing roadside waste"
      description="Waste is visible at 123 Main Street. Contact team@example.org."
      category="garbage"
      address="123 Main Street"
      coords={{ lat: 42.12345, lng: -72.67891 }}
      selectedAuthorityHandles={['@council']}
      authoritySuggestions={[]}
      privacy="bluesky"
      onSubmit={jest.fn()}
      onBack={jest.fn()}
      onEditDetails={jest.fn()}
      onEditPrivacy={jest.fn()}
    />
  );

  expect(screen.getByTestId('bluesky-report-preview')).toBeTruthy();
  expect(screen.getByText('Civic Vigilance')).toBeTruthy();
  expect(screen.getByText(/address removed/)).toBeTruthy();
  expect(screen.getByText(/contact removed/)).toBeTruthy();
  expect(screen.queryByText(/42\.12345/)).toBeNull();
  expect(screen.getByLabelText('Photo that will be published publicly on Bluesky')).toBeTruthy();
  expect(screen.getByText(/No personal Bluesky login is needed/)).toBeTruthy();
});
