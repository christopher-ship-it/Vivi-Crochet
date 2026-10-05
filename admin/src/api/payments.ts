import { apiRequest } from './client';
import type { AdminPaymentsResponse } from '../types';

export async function listAdminPayments(): Promise<AdminPaymentsResponse> {
  return apiRequest<AdminPaymentsResponse>('/api/admin/payments');
}

/** Recovers a payment Razorpay captured but the server never recorded (unlocks the purchase). */
export async function syncAdminPayment(id: string, razorpayPaymentId: string): Promise<void> {
  await apiRequest<void>(`/api/admin/payments/${id}/sync`, {
    method: 'POST',
    body: JSON.stringify({ razorpayPaymentId }),
  });
}
