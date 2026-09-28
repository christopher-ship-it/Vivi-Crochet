import { apiRequest } from './client';

export interface FoundingMembershipCourse {
  id: string;
  name: string;
  regularPrice: number;
}

export interface FoundingMembershipViralProject {
  id: string;
  name: string;
  thumbnailUrl?: string | null;
}

export interface FoundingMembershipOffer {
  courseId: string;
  offerName: string;
  isActive: boolean;
  launchPrice: number;
  regularPriceAfterLaunch: number;
  mrp: number;
  launchLimit: number;
  completedPurchaseCount: number;
  remaining: number;
  accessDurationDays: number;
  includedCourses: FoundingMembershipCourse[];
  viralProject?: FoundingMembershipViralProject | null;
  benefits: string[];
}

export interface MyMembership {
  isMember: boolean;
  memberNumber?: number | null;
  offerName?: string | null;
  badgeGrantedAt?: string | null;
  accessExpiryDate?: string | null;
  isActive?: boolean | null;
  viralProject?: FoundingMembershipViralProject | null;
}

/** Public — server-authoritative offer state. Never hardcode price/limit/viral-project on the client. */
export async function getFoundingMembershipOffer(): Promise<FoundingMembershipOffer> {
  return apiRequest<FoundingMembershipOffer>('/api/offers/founding-membership', {}, false);
}

/** Authenticated — the caller's founding-membership status, or `{ isMember: false }`. */
export async function getMyMembership(): Promise<MyMembership> {
  return apiRequest<MyMembership>('/api/me/membership');
}
