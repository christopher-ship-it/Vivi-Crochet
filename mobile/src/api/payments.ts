import { apiRequest } from './client';

export interface RazorpayVerifyRequest {
  internalOrderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface RazorpayVerifyResponse {
  orderId: string;
  orderNumber: string;
  status: string;
  alreadyProcessed: boolean;
}

export async function verifyRazorpayPayment(
  payload: RazorpayVerifyRequest,
): Promise<RazorpayVerifyResponse> {
  return apiRequest<RazorpayVerifyResponse>('/api/payments/razorpay/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
