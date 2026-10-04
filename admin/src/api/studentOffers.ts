import { apiRequest } from './client';
import type {
  AdminStudentCode,
  AdminStudentCodeRequest,
  AdminStudentMemberListResponse,
  AdminStudentOffer,
} from '../types';

export async function getStudentOffer(): Promise<AdminStudentOffer> {
  return apiRequest<AdminStudentOffer>('/api/admin/student-offers');
}

export async function updateStudentPrice(
  studentPrice: number,
  studentPriceUsd: number | null,
): Promise<AdminStudentOffer> {
  return apiRequest<AdminStudentOffer>('/api/admin/student-offers/settings', {
    method: 'PUT',
    body: JSON.stringify({ studentPrice, studentPriceUsd }),
  });
}

export async function createStudentCode(data: AdminStudentCodeRequest): Promise<AdminStudentCode> {
  return apiRequest<AdminStudentCode>('/api/admin/student-offers/codes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateStudentCode(
  id: string,
  data: AdminStudentCodeRequest,
): Promise<AdminStudentCode> {
  return apiRequest<AdminStudentCode>(`/api/admin/student-offers/codes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export type ListStudentMembersParams = {
  search?: string;
  codeId?: string;
  page?: number;
  pageSize?: number;
};

export async function listStudentMembers(
  params: ListStudentMembersParams = {},
): Promise<AdminStudentMemberListResponse> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.codeId) query.set('codeId', params.codeId);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  const qs = query.toString();
  return apiRequest<AdminStudentMemberListResponse>(
    `/api/admin/student-offers/members${qs ? `?${qs}` : ''}`,
  );
}
