import { apiRequest } from './client';
import type { AdminPaymentsResponse } from '../types';

export async function listAdminPayments(): Promise<AdminPaymentsResponse> {
  return apiRequest<AdminPaymentsResponse>('/api/admin/payments');
}
