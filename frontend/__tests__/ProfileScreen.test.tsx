import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ProfileScreen from '../screens/ProfileScreen';
import { loadProfile, saveProfile } from '../lib/profile';
import { useAuth } from '../hooks/useAuth';

jest.mock('../hooks/useAuth', () => ({ useAuth: jest.fn() }));
jest.mock('../lib/profile', () => ({
  loadProfile: jest.fn(),
  saveProfile: jest.fn(),
}));
jest.mock('../components/ListItem', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return ({ title, onPress }: { title: string; onPress: () => void }) => (
    <Pressable onPress={onPress}><Text>{title}</Text></Pressable>
  );
});

const initialProfile = {
  id: 'user-123',
  uid: 'user-123',
  first_name: 'Ana',
  last_name: 'Silva',
  full_name: 'Ana Silva',
  username: 'ana_silva',
  phone_number: '+14155552671',
  createdAt: new Date('2025-05-01T00:00:00.000Z'),
};

const mockRefreshProfile = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAuth).mockReturnValue({
    session: { user: { id: 'user-123', email: 'ana@example.org' } },
    profile: { ...initialProfile },
    signOut: jest.fn(),
    isGuest: false,
    refreshProfile: mockRefreshProfile,
  } as any);
  jest.mocked(loadProfile).mockResolvedValue({ ...initialProfile } as any);
  jest.mocked(saveProfile).mockImplementation(async (profile: any) => ({ ...initialProfile, ...profile } as any));
});

test('shows saved account data and persists profile edits', async () => {
  const screen = render(<ProfileScreen navigation={{ navigate: jest.fn() }} />);

  expect(await screen.findByText('Ana Silva')).toBeTruthy();
  expect(screen.getByText('ana@example.org')).toBeTruthy();
  expect(screen.getByText('@ana_silva')).toBeTruthy();
  expect(screen.getByText('+14155552671')).toBeTruthy();

  fireEvent.press(screen.getByRole('button', { name: 'Edit Profile' }));
  fireEvent.changeText(screen.getByLabelText('First name *'), 'Ana Maria');
  fireEvent.press(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({
    id: 'user-123',
    first_name: 'Ana Maria',
    last_name: 'Silva',
    full_name: 'Ana Maria Silva',
    username: 'ana_silva',
    phone_number: '+14155552671',
  })));
  expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('Profile updated successfully.')).toBeTruthy();
  expect(screen.getByText('Ana Maria Silva')).toBeTruthy();
});

test('allows existing users with missing names to complete their profile', async () => {
  jest.mocked(loadProfile).mockResolvedValue({ id: 'user-123', email: 'ana@example.org' } as any);
  const screen = render(<ProfileScreen navigation={{ navigate: jest.fn() }} />);
  await screen.findByText('Complete your profile');
  fireEvent.press(screen.getByRole('button', { name: 'Edit Profile' }));
  fireEvent.changeText(screen.getByLabelText('First name *'), 'Ana');
  fireEvent.changeText(screen.getByLabelText('Last name *'), 'Silva');
  fireEvent.press(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({
    id: 'user-123',
    first_name: 'Ana',
    last_name: 'Silva',
    full_name: 'Ana Silva',
  })));
});
