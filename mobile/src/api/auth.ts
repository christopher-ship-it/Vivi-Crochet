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
  options?: {
    name?: string;
    age?: number;
    state?: string;
    city?: string;
  },
): Promise<LoginResponse> {
  return apiRequest<LoginResponse>(
    '/api/auth/mobile/otp/verify',
    {
      method: 'POST',
      body: JSON.stringify({
        challengeId,
        code,
        name: options?.name,
        age: options?.age,
        state: options?.state,
        city: options?.city,
      }),
    },
    false,
  );
}

export async function registerCustomerEmail(input: {
  email: string;
  password: string;
  age: number;
  country: string;
  name?: string;
}): Promise<LoginResponse> {
  return apiRequest<LoginResponse>(
    '/api/auth/mobile/email/register',
    {
      method: 'POST',
      body: JSON.stringify({
        email: input.email.trim(),
        password: input.password,
        age: input.age,
        country: input.country.trim(),
        name: input.name?.trim() || undefined,
      }),
    },
    false,
  );
}

export async function loginCustomerEmail(
  email: string,
  password: string,
): Promise<LoginResponse> {
  return apiRequest<LoginResponse>(
    '/api/auth/mobile/email/login',
    {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim(),
        password,
      }),
    },
    false,
  );
}

export async function requestCustomerPasswordReset(email: string): Promise<{
  expiresInSeconds: number;
  message: string;
}> {
  return apiRequest(
    '/api/auth/mobile/email/password-reset/request',
    {
      method: 'POST',
      body: JSON.stringify({ email: email.trim() }),
    },
    false,
  );
}

export async function confirmCustomerPasswordReset(input: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<void> {
  await apiRequest<void>(
    '/api/auth/mobile/email/password-reset/confirm',
    {
      method: 'POST',
      body: JSON.stringify({
        email: input.email.trim(),
        code: input.code.trim(),
        newPassword: input.newPassword,
      }),
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
