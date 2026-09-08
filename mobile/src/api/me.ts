import { apiRequest } from './client';

export interface SavedShippingAddress {
  fullName: string;
  phoneNumber: string;
  addressLine1: string;
  addressLine2?: string | null;
  landmark?: string | null;
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
  shippingAddress?: SavedShippingAddress | null;
}

export async function getMyProfile(): Promise<CustomerProfile> {
  return apiRequest<CustomerProfile>('/api/me/profile');
}

export async function updateMyProfile(input: {
  fullName?: string;
  email?: string;
  shippingAddress?: {
    fullName: string;
    phoneNumber: string;
    addressLine1: string;
    addressLine2?: string;
    landmark?: string;
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
