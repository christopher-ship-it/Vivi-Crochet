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
