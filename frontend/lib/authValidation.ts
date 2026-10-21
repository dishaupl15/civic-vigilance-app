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

export function validatePersonName(value: string, label: string): string | null {
  const normalized = value.trim();
  if (!normalized) return `${label} is required.`;
  if (normalized.length > 80) return `${label} must be 80 characters or fewer.`;
  if (/[\u0000-\u001F\u007F]/.test(normalized)) return `Enter a valid ${label.toLowerCase()}.`;
  return null;
}

export function normalizePhoneNumber(value: string): string {
  return value.trim().replace(/[\s().-]/g, '');
}

export function validatePhoneNumber(value: string): string | null {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) return null;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    return 'Enter a phone number with country code, such as +14155552671.';
  }
  return null;
}
