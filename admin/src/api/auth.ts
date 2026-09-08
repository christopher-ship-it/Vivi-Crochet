import { apiRequest } from './client';
import type { LoginResponse } from '../types';

export async function login(email: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    false,
  );
}
