import { apiRequest } from './client';
import type {
  AdminOrderDetail,
  AdminOrderListItem,
  UpdateDeliveryDateRequest,
} from '../types';

export async function listAdminOrders(): Promise<AdminOrderListItem[]> {
  return apiRequest<AdminOrderListItem[]>('/api/admin/orders');
}

export async function getAdminOrder(id: string): Promise<AdminOrderDetail> {
  return apiRequest<AdminOrderDetail>(`/api/admin/orders/${id}`);
}

export async function updateOrderDeliveryDate(
  id: string,
  data: UpdateDeliveryDateRequest,
): Promise<AdminOrderDetail> {
  return apiRequest<AdminOrderDetail>(`/api/admin/orders/${id}/delivery-date`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function updateOrderStatus(
  id: string,
  data: { status: string; note?: string | null },
): Promise<AdminOrderDetail> {
  return apiRequest<AdminOrderDetail>(`/api/admin/orders/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteAdminOrder(id: string): Promise<void> {
  await apiRequest<void>(`/api/admin/orders/${id}`, { method: 'DELETE' });
}
