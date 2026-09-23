import { apiRequest } from './client';

export interface AdminSupportInquiry {
  id: string;
  customerId: string;
  customerName: string;
  phoneNumber: string;
  email: string;
  message: string;
  createdAt: string;
  isRead: boolean;
}

export async function listSupportInquiries(): Promise<AdminSupportInquiry[]> {
  return apiRequest<AdminSupportInquiry[]>('/api/admin/support-inquiries');
}

export async function getSupportUnreadCount(): Promise<number> {
  const res = await apiRequest<{ count: number }>('/api/admin/support-inquiries/unread-count');
  return res.count;
}

export async function markSupportInquiryRead(id: string): Promise<void> {
  await apiRequest<void>(`/api/admin/support-inquiries/${id}/read`, {
    method: 'POST',
  });
}
