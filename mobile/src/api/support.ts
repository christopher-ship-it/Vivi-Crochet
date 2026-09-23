import { apiRequest } from './client';

export interface SupportInquiryCreated {
  id: string;
  createdAt: string;
}

export async function createSupportInquiry(message: string): Promise<SupportInquiryCreated> {
  return apiRequest<SupportInquiryCreated>('/api/me/support-inquiries', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}
