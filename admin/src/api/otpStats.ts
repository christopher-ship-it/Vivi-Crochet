import { apiRequest } from './client';
import type { OtpHistory, OtpStats } from '../types';

export async function getOtpStats(): Promise<OtpStats> {
  return apiRequest<OtpStats>('/api/admin/otp-stats');
}

/** Every day, month and request since the first OTP. */
export async function getOtpHistory(): Promise<OtpHistory> {
  return apiRequest<OtpHistory>('/api/admin/otp-stats/history');
}
