export type CourseType = 'DigitalCourse' | 'ProjectCourse' | 'Bundle';
export type CourseStatus = 'Draft' | 'Published';
export type VideoStatus = 'Draft' | 'Published';

export interface ApiError {
  code: string;
  message: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  phone?: string | null;
}

export interface LoginResponse {
  accessToken: string;
  expiresAt: string;
  user: User;
  requiresProfileSetup?: boolean;
  isNewCustomer?: boolean;
}

export interface Category {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface CourseLesson {
  id: string;
  title: string;
  description?: string | null;
  durationSeconds?: number | null;
  isFreePreview: boolean;
  sortOrder: number;
  status: VideoStatus;
}

export interface Course {
  id: string;
  categoryId?: string | null;
  categoryName?: string | null;
  name: string;
  type: CourseType;
  level?: string | null;
  /** Short copy for Home Viral / Trending hero slides. */
  description?: string | null;
  about?: string | null;
  price: number;
  mrp?: number | null;
  accessDays: number;
  renewalPercentage: number;
  languages?: string | null;
  thumbnailUrl?: string | null;
  /** Lower values appear first in Viral / Trending discovery. */
  sortOrder?: number;
  status: CourseStatus;
  videoCount: number;
  createdAt: string;
  updatedAt: string;
  lessons?: CourseLesson[] | null;
}

export interface Video {
  id: string;
  courseId: string;
  title: string;
  description?: string | null;
  durationSeconds?: number | null;
  videoFileName: string;
  fileSizeBytes: number;
  contentType: string;
  isFreePreview: boolean;
  uploadConfirmed: boolean;
  status: VideoStatus;
  sortOrder: number;
}

export interface StreamUrlResponse {
  videoId: string;
  title: string;
  streamUrl: string;
  expiresAt: string;
}

export type ProductStatus = 'Draft' | 'Published';

/** Handmade Collection vs Crochet Essentials (stocked/resold). */
export type ProductType = 'Handmade' | 'Resell';

export interface LinkedCourseSummary {
  id: string;
  name: string;
  price: number;
  videoCount: number;
  level?: string | null;
}

export interface RecommendedEssentialSummary {
  id: string;
  name: string;
  category: string;
  price: number;
  imageUrl?: string | null;
  availableStock: number;
}

export interface ProductImage {
  id: string;
  url: string;
  blobPath: string;
  sortOrder: number;
  isMain: boolean;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  price: number;
  mrp?: number | null;
  imageUrl?: string | null;
  images?: ProductImage[];
  spec1?: string | null;
  spec2?: string | null;
  courseId?: string | null;
  linkedCourse?: LinkedCourseSummary | null;
  recommendedEssentials?: RecommendedEssentialSummary[];
  sortOrder: number;
  productType?: ProductType;
  availableStock: number;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}
