export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < 8) return 'Password should be at least 8 characters.';
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
    return 'Password must include uppercase, lowercase, and a number.';
  }
  if (password !== confirmation) return 'Passwords do not match.';
  return null;
}

export function validateEmail(email: string): string | null {
  const normalized = email.trim();
  if (!normalized) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return 'Enter a valid email address.';
  return null;
}
