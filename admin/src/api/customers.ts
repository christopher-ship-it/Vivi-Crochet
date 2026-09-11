import { apiRequest } from './client';
import type { AdminCustomerListItem } from '../types';

export async function listAdminCustomers(q?: string): Promise<AdminCustomerListItem[]> {
  const params = new URLSearchParams();
  if (q?.trim()) params.set('q', q.trim());
  const query = params.toString();
  return apiRequest<AdminCustomerListItem[]>(
    `/api/admin/customers${query ? `?${query}` : ''}`,
  );
}
