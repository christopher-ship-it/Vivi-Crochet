import { apiRequest } from './client';
import type {
  AdminSpecialOffer,
  AdminSpecialOfferRequest,
  FoundingMemberListResponse,
} from '../types';

export async function listSpecialOffers(): Promise<AdminSpecialOffer[]> {
  return apiRequest<AdminSpecialOffer[]>('/api/admin/special-offers');
}

export async function getSpecialOffer(courseId: string): Promise<AdminSpecialOffer> {
  return apiRequest<AdminSpecialOffer>(`/api/admin/special-offers/${courseId}`);
}

export async function updateSpecialOffer(
  courseId: string,
  data: AdminSpecialOfferRequest,
): Promise<AdminSpecialOffer> {
  return apiRequest<AdminSpecialOffer>(`/api/admin/special-offers/${courseId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export type ListFoundingMembersParams = {
  search?: string;
  status?: 'active' | 'expired' | '';
  page?: number;
  pageSize?: number;
};

export async function listFoundingMembers(
  courseId: string,
  params: ListFoundingMembersParams = {},
): Promise<FoundingMemberListResponse> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  const qs = query.toString();
  return apiRequest<FoundingMemberListResponse>(
    `/api/admin/special-offers/${courseId}/members${qs ? `?${qs}` : ''}`,
  );
}
