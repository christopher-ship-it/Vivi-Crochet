import { apiRequest } from './client';
import type { LoginResponse } from '../types';

export interface OtpRequestResponse {
  challengeId: string;
  expiresInSeconds: number;
}

export async function requestMobileOtp(phone: string): Promise<OtpRequestResponse> {
  return apiRequest<OtpRequestResponse>(
    '/api/auth/mobile/otp/request',
    {
      method: 'POST',
      body: JSON.stringify({ phone }),
    },
    false,
  );
}

export async function verifyMobileOtp(
  challengeId: string,
  code: string,
  name?: string,
): Promise<LoginResponse> {
  return apiRequest<LoginResponse>(
    '/api/auth/mobile/otp/verify',
    {
      method: 'POST',
      body: JSON.stringify({ challengeId, code, name }),
    },
    false,
  );
}

/**
 * Signs in the complimentary test account. The phone lives in server config, so the
 * access code is the only thing the app sends.
 */
export async function testAccountLogin(secret: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>(
    '/api/auth/test-login',
    {
      method: 'POST',
      body: JSON.stringify({ secret }),
    },
    false,
  );
}

export async function devCustomerLogin(phone: string, name?: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>(
    '/api/auth/dev/customer-login',
    {
      method: 'POST',
      body: JSON.stringify({ phone, name }),
    },
    false,
  );
}
