import { apiRequest } from './client';
import type { AdminUser } from '../types';

export interface AdminTeamUser {
  id: string;
  email: string;
  name: string;
  role: 'Admin' | 'Staff' | string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getAdminProfile(): Promise<AdminUser> {
  return apiRequest<AdminUser>('/api/admin/me');
}

export async function updateAdminProfile(name: string): Promise<AdminUser> {
  return apiRequest<AdminUser>('/api/admin/me', {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

export async function listTeamUsers(): Promise<AdminTeamUser[]> {
  return apiRequest<AdminTeamUser[]>('/api/admin/team-users');
}

export async function createTeamUser(input: {
  name: string;
  email: string;
  password: string;
  role: 'Admin' | 'Staff';
}): Promise<AdminTeamUser> {
  return apiRequest<AdminTeamUser>('/api/admin/team-users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateTeamUser(
  id: string,
  input: {
    name: string;
    role: 'Admin' | 'Staff';
    isActive: boolean;
    newPassword?: string;
  },
): Promise<AdminTeamUser> {
  return apiRequest<AdminTeamUser>(`/api/admin/team-users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
