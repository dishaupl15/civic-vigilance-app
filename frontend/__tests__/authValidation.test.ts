import { validateEmail, validateNewPassword } from '../lib/authValidation';

describe('authentication input validation', () => {
  test('accepts well-formed email addresses and rejects missing or malformed values', () => {
    expect(validateEmail(' user@example.org ')).toBeNull();
    expect(validateEmail('')).toBe('Email is required.');
    expect(validateEmail('not-an-email')).toBe('Enter a valid email address.');
  });

  test('requires a strong matching password and confirmation', () => {
    expect(validateNewPassword('StrongPass1', 'StrongPass1')).toBeNull();
    expect(validateNewPassword('short', 'short')).toMatch(/at least 8/);
    expect(validateNewPassword('alllowercase1', 'alllowercase1')).toMatch(/uppercase, lowercase/);
    expect(validateNewPassword('StrongPass1', 'DifferentPass1')).toBe('Passwords do not match.');
  });
});
