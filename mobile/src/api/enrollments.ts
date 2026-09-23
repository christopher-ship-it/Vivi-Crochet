import { apiRequest } from './client';

export interface Enrollment {
  id: string;
  courseId: string;
  courseName: string;
  purchaseDate: string;
  accessStartDate: string;
  accessExpiryDate: string;
  isActive: boolean;
  isExpired: boolean;
  completedFlag: boolean;
  completedAt?: string | null;
}

export interface CoursePricing {
  courseId: string;
  name?: string;
  courseName: string;
  listPrice: number;
  mrp?: number | null;
  price?: number;
  applicablePrice: number;
  isLaunchOffer?: boolean;
  launchOfferActive: boolean;
  launchOfferRemaining?: number | null;
  accessDays: number;
  isRenewalOffer?: boolean;
  renewalPercentage?: number | null;
}

export async function listMyEnrollments(): Promise<Enrollment[]> {
  return apiRequest<Enrollment[]>('/api/me/enrollments');
}

export async function getMyEnrollment(courseId: string): Promise<Enrollment> {
  return apiRequest<Enrollment>(`/api/me/enrollments/${courseId}`);
}

/** Marks a purchased course finished for journey / encouragement (idempotent). */
export async function completeMyEnrollment(courseId: string): Promise<Enrollment> {
  return apiRequest<Enrollment>(`/api/me/enrollments/${courseId}/complete`, {
    method: 'POST',
  });
}

/** Prefer authenticated call so personal renewal pricing is included when signed in. */
export async function getCoursePricing(courseId: string): Promise<CoursePricing> {
  return apiRequest<CoursePricing>(`/api/courses/${courseId}/pricing`);
}
