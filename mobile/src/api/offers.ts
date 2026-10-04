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
  /** Admin-set badge text while live / after the offer ends. Null means use the app default. */
  badgeText?: string | null;
  endedBadgeText?: string | null;
  isActive: boolean;
  launchPrice: number;
  regularPriceAfterLaunch: number;
  mrp: number;
  /** INR or USD. */
  currency?: string;
  /** False when the membership is not sold in the user's country. */
  availableInMarket?: boolean;
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
  /** Founding-member ID, e.g. VV-KQTD-007. */
  memberCode?: string | null;
  /** True for a student-code membership; students are numbered separately from the launch members. */
  isStudent?: boolean;
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

export interface StudentCodeCheck {
  valid: boolean;
  /** The student price in the buyer's currency. */
  price: number;
  currency?: string;
  accessDurationDays: number;
}

/** Authenticated — checks a student code and returns the price it unlocks. Throws an ApiClientError when the code cannot be used. */
export async function validateStudentCode(code: string): Promise<StudentCodeCheck> {
  return apiRequest<StudentCodeCheck>('/api/offers/student-code/validate', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}
