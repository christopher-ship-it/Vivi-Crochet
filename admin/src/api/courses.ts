import { apiRequest } from './client';
import type { Category, CategoryRequest, Course, CourseRequest } from '../types';

export async function listCourses(): Promise<Course[]> {
  return apiRequest<Course[]>('/api/courses');
}

export async function getCourse(id: string): Promise<Course> {
  return apiRequest<Course>(`/api/courses/${id}`);
}

export async function createCourse(data: CourseRequest): Promise<Course> {
  return apiRequest<Course>('/api/courses', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCourse(id: string, data: CourseRequest): Promise<Course> {
  return apiRequest<Course>(`/api/courses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCourse(id: string): Promise<void> {
  return apiRequest<void>(`/api/courses/${id}`, { method: 'DELETE' });
}

export async function publishCourse(id: string): Promise<Course> {
  return apiRequest<Course>(`/api/courses/${id}/publish`, { method: 'POST' });
}

export async function unpublishCourse(id: string): Promise<Course> {
  return apiRequest<Course>(`/api/courses/${id}/unpublish`, { method: 'POST' });
}

export async function listCategories(): Promise<Category[]> {
  return apiRequest<Category[]>('/api/categories');
}

export async function createCategory(data: CategoryRequest): Promise<Category> {
  return apiRequest<Category>('/api/categories', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCategory(id: string, data: CategoryRequest): Promise<Category> {
  return apiRequest<Category>(`/api/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCategory(id: string): Promise<void> {
  return apiRequest<void>(`/api/categories/${id}`, { method: 'DELETE' });
}
