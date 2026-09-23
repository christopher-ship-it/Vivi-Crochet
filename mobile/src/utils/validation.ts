export function normalizePhone(input: string | null | undefined): string {
  const digits = (input ?? '').replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

/**
 * India OTP accounts, or profiles with country missing / "India".
 * International email/password accounts always return false.
 */
export function isIndiaAccount(input: {
  authMethod?: string | null;
  country?: string | null;
}): boolean {
  const method = (input.authMethod ?? '').trim();
  if (method === 'EmailPassword') return false;
  if (method === 'PhoneOtp') return true;
  const country = input.country?.trim().toLowerCase() ?? '';
  return !country || country === 'india';
}

/** India OTP login email is customer.{10-digit}@vivicrochet.dev — recover the mobile from it. */
export function phoneFromCustomerLoginEmail(email: string | null | undefined): string {
  const value = email?.trim().toLowerCase() ?? '';
  const prefix = 'customer.';
  const suffix = '@vivicrochet.dev';
  if (!value.startsWith(prefix) || !value.endsWith(suffix)) return '';
  const embedded = value.slice(prefix.length, value.length - suffix.length);
  return normalizePhone(embedded);
}

export function normalizePin(input: string | null | undefined): string {
  return (input ?? '').replace(/\D/g, '').slice(0, 6);
}

/** International postal / ZIP — keep letters, digits, spaces, hyphens. */
export function normalizePostalCode(input: string | null | undefined): string {
  return (input ?? '').replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 12);
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input).length === 10;
}

export function sanitizeEmail(input: string | null | undefined): string {
  return (input ?? '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
}

export function isValidEmail(input: string): boolean {
  const trimmed = sanitizeEmail(input);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/** India OTP accounts use customer.{phone}@vivicrochet.dev — not a real inbox. */
export function isSyntheticEmail(input: string | null | undefined): boolean {
  return sanitizeEmail(input).endsWith('@vivicrochet.dev');
}

/** Real customer email suitable for order / booking notifications. */
export function isUsableCustomerEmail(input: string | null | undefined): boolean {
  const value = sanitizeEmail(input);
  return isValidEmail(value) && !isSyntheticEmail(value);
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

/** Non-India postal codes — required, but not forced to Indian PIN format. */
export function isValidPostalCode(input: string): boolean {
  const value = (input ?? '').trim();
  return value.length >= 3 && value.length <= 12;
}

export type ShippingFieldKey =
  | 'fullName'
  | 'phone'
  | 'address1'
  | 'city'
  | 'state'
  | 'pinCode';

export type ShippingAddressInput = {
  fullName: string;
  phone: string;
  address1: string;
  city: string;
  state: string;
  pinCode: string;
  /** When false (international accounts), skip 10-digit Indian mobile check. */
  requireIndianPhone?: boolean;
  /** When false, require a postal code without Indian PIN rules. Defaults to requireIndianPhone. */
  requireIndianPin?: boolean;
};

export function getShippingAddressFieldErrors(
  input: ShippingAddressInput,
): Partial<Record<ShippingFieldKey, string>> {
  const errors: Partial<Record<ShippingFieldKey, string>> = {};
  const requireIndianPhone = input.requireIndianPhone !== false;
  const requireIndianPin = input.requireIndianPin ?? requireIndianPhone;

  if (!isValidName(input.fullName)) {
    errors.fullName = 'Enter the recipient full name (at least 2 characters).';
  }

  if (requireIndianPhone) {
    if (!isValidPhone(input.phone)) {
      errors.phone = 'Enter a valid 10-digit Indian mobile number.';
    }
  } else {
    const digits = (input.phone ?? '').replace(/\D/g, '');
    if (!digits) {
      errors.phone = 'Enter your phone number with country code.';
    } else if (digits.length < 8 || digits.length > 15) {
      errors.phone = 'Enter a valid phone number for the selected country code.';
    }
  }

  if (input.address1.trim().length < 2) {
    errors.address1 = 'Enter house / flat / office number.';
  }
  if (input.city.trim().length < 2) {
    errors.city = 'Enter your delivery city.';
  }
  if (input.state.trim().length < 2) {
    errors.state = requireIndianPhone
      ? 'Enter your delivery state.'
      : 'Enter your state / province / region.';
  }

  if (requireIndianPin) {
    if (!isValidPin(input.pinCode)) {
      errors.pinCode = 'Enter a valid 6-digit PIN code (e.g. 641001).';
    }
  } else if (!isValidPostalCode(input.pinCode)) {
    errors.pinCode = 'Enter a valid postal code.';
  }

  return errors;
}

export function getShippingAddressError(input: ShippingAddressInput): string | null {
  const errors = getShippingAddressFieldErrors(input);
  return (
    errors.fullName
    ?? errors.phone
    ?? errors.address1
    ?? errors.city
    ?? errors.state
    ?? errors.pinCode
    ?? null
  );
}
