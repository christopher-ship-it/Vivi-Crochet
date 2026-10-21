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

export interface MySupportInquiry {
  id: string;
  message: string;
  createdAt: string;
  reply?: string | null;
  repliedAt?: string | null;
}

export async function listMySupportInquiries(): Promise<MySupportInquiry[]> {
  return apiRequest<MySupportInquiry[]>('/api/me/support-inquiries');
}
