import { apiRequest } from './client';
import type { Category, Course } from '../types';

export async function listCategories(): Promise<Category[]> {
  return apiRequest<Category[]>('/api/categories', {}, false);
}

export async function listCourses(categoryId?: string): Promise<Course[]> {
  const query = categoryId ? `?categoryId=${categoryId}` : '';
  return apiRequest<Course[]>(`/api/courses${query}`, {}, false);
}

export async function getCourse(id: string): Promise<Course> {
  return apiRequest<Course>(`/api/courses/${id}`, {}, false);
}
