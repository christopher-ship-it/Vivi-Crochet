import { apiRequest } from './client';
import type { OtpStats } from '../types';

export async function getOtpStats(): Promise<OtpStats> {
  return apiRequest<OtpStats>('/api/admin/otp-stats');
}
