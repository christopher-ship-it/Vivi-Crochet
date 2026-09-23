import { apiRequest } from './client';

export type AddressTag = 'Home' | 'Work' | 'Other';

export interface SavedShippingAddress {
  fullName: string;
  phoneNumber: string;
  addressLine1: string;
  addressLine2?: string | null;
  landmark?: string | null;
  /** Home, Work, or Other */
  tag?: string | null;
  city: string;
  state: string;
  pinCode: string;
  country: string;
}

export interface CustomerProfile {
  id: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  isEmailVerified?: boolean;
  age?: number | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  authMethod?: string | null;
  shippingAddress?: SavedShippingAddress | null;
}

export async function getMyProfile(): Promise<CustomerProfile> {
  return apiRequest<CustomerProfile>('/api/me/profile');
}

export async function updateMyProfile(input: {
  fullName?: string;
  email?: string;
  phoneNumber?: string;
  age?: number;
  state?: string;
  city?: string;
  shippingAddress?: {
    fullName: string;
    phoneNumber: string;
    addressLine1: string;
    addressLine2?: string;
    landmark?: string;
    tag?: AddressTag;
    city: string;
    state: string;
    pinCode: string;
    country?: string;
  };
}): Promise<CustomerProfile> {
  return apiRequest<CustomerProfile>('/api/me/profile', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function requestEmailVerification(email: string): Promise<{
  expiresInSeconds: number;
  message: string;
}> {
  return apiRequest('/api/me/email/verify/request', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim() }),
  });
}

export async function confirmEmailVerification(input: {
  email: string;
  code: string;
}): Promise<CustomerProfile> {
  return apiRequest<CustomerProfile>('/api/me/email/verify/confirm', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email.trim(),
      code: input.code.trim(),
    }),
  });
}

/** Permanently deletes the authenticated customer account and related data. */
export async function deleteMyAccount(): Promise<void> {
  await apiRequest<void>('/api/me/account', { method: 'DELETE' });
}
