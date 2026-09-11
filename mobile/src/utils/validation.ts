export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

export function normalizePin(input: string): string {
  return input.replace(/\D/g, '').slice(0, 6);
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input).length === 10;
}

export function isValidEmail(input: string): boolean {
  const trimmed = input.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/** Backend default when OTP sign-in did not include a name. Treat as unset. */
export const PLACEHOLDER_CUSTOMER_NAME = 'VIVI Customer';

export function isPlaceholderCustomerName(input: string | null | undefined): boolean {
  const trimmed = input?.trim() ?? '';
  return !trimmed || trimmed.toLowerCase() === PLACEHOLDER_CUSTOMER_NAME.toLowerCase();
}

/** First usable customer name, skipping empty / placeholder values. */
export function realCustomerName(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim() ?? '';
    if (trimmed && !isPlaceholderCustomerName(trimmed)) return trimmed;
  }
  return '';
}

export function isValidName(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.length >= 2 && !isPlaceholderCustomerName(trimmed);
}

export function isValidPin(input: string): boolean {
  return /^[1-9][0-9]{5}$/.test(normalizePin(input));
}

export function getShippingAddressError(input: {
  fullName: string;
  phone: string;
  address1: string;
  city: string;
  state: string;
  pinCode: string;
}): string | null {
  if (!isValidName(input.fullName)) {
    return 'Enter the recipient full name (at least 2 characters).';
  }
  if (!isValidPhone(input.phone)) {
    return 'Enter a valid 10-digit Indian mobile number.';
  }
  if (input.address1.trim().length < 2) {
    return 'Enter address line 1.';
  }
  if (input.city.trim().length < 2) {
    return 'Enter your delivery city.';
  }
  if (input.state.trim().length < 2) {
    return 'Enter your delivery state.';
  }
  if (!isValidPin(input.pinCode)) {
    return 'Enter a valid 6-digit PIN code (e.g. 641001).';
  }
  return null;
}
