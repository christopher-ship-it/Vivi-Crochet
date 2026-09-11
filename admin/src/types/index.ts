export type CourseType = 'DigitalCourse' | 'ProjectCourse' | 'Bundle';
export type CourseStatus = 'Draft' | 'Published';
export type VideoStatus = 'Draft' | 'Published';

export interface ApiError {
  code: string;
  message: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresAt: string;
  user: AdminUser;
}

export interface Category {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryRequest {
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
  about?: string | null;
  price: number;
  mrp?: number | null;
  accessDays: number;
  renewalPercentage: number;
  languages?: string | null;
  thumbnailUrl?: string | null;
  status: CourseStatus;
  videoCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lessons?: CourseLesson[] | null;
  includedCourses?: IncludedCourse[] | null;
  launchOffer?: LaunchOfferAdmin | null;
}

export interface IncludedCourse {
  id: string;
  name: string;
  accessDays: number;
  videoCount: number;
}

export interface LaunchOfferAdmin {
  launchPrice: number;
  launchLimit: number;
  regularPriceAfterLaunch: number;
  mrp: number;
}

export interface CourseRequest {
  name: string;
  categoryId?: string | null;
  type: CourseType;
  level?: string | null;
  about?: string | null;
  price: number;
  mrp?: number | null;
  accessDays: number;
  renewalPercentage: number;
  languages?: string | null;
  includedCourseIds?: string[] | null;
  launchPrice?: number | null;
  launchLimit?: number | null;
  regularPriceAfterLaunch?: number | null;
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
  createdAt: string;
  updatedAt: string;
}

export interface UploadUrlRequest {
  courseId: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
}

export interface UploadUrlResponse {
  videoId: string;
  uploadUrl: string;
  expiresAt: string;
  blobPath: string;
  maxFileSizeBytes: number;
}

export interface UpdateVideoRequest {
  title: string;
  description?: string | null;
  durationSeconds?: number | null;
  isFreePreview: boolean;
  sortOrder?: number | null;
}

export type ProductStatus = 'Draft' | 'Published';
export type ProductType = 'Handmade' | 'Resell';

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
  linkedCourse?: {
    id: string;
    name: string;
    price: number;
    videoCount: number;
    level?: string | null;
  } | null;
  sortOrder: number;
  productType: ProductType;
  availableStock: number;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProductRequest {
  name: string;
  category: string;
  description?: string | null;
  price: number;
  mrp?: number | null;
  spec1?: string | null;
  spec2?: string | null;
  courseId?: string | null;
  sortOrder: number;
  productType: ProductType;
  availableStock: number;
}

export interface ProductImageUploadUrlRequest {
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
}

export interface ProductImageUploadUrlResponse {
  uploadUrl: string;
  expiresAt: string;
  blobPath: string;
  maxFileSizeBytes: number;
}

export interface ProductImageUploadCompleteRequest {
  blobPath: string;
  fileSizeBytes: number;
  contentType: string;
  setAsMain?: boolean;
}

export type OrderStatus =
  | 'PendingPayment'
  | 'Paid'
  | 'Confirmed'
  | 'InProduction'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled'
  | 'PaymentFailed';

export type PaymentStatus = 'Created' | 'Authorized' | 'Captured' | 'Failed' | 'Refunded';

export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus?: PaymentStatus | null;
  totalAmount: number;
  customerName: string;
  customerPhone: string;
  createdAt: string;
  hasPhysicalItems: boolean;
  deliveryDateOverridden: boolean;
  deliveryLabel?: string | null;
}

export interface OrderItem {
  id: string;
  itemType: string;
  productId?: string | null;
  courseId?: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  totalAmount: number;
  itemNameSnapshot: string;
}

export interface ShippingAddress {
  fullName: string;
  phoneNumber: string;
  addressLine1: string;
  addressLine2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pinCode: string;
  country: string;
}

export interface OrderDelivery {
  isCoimbatore: boolean;
  locationLabel: string;
  minDays: number;
  maxDays: number;
  estimateSummary: string;
  systemFrom: string;
  systemTo: string;
  expectedFrom: string;
  expectedTo: string;
  isOverridden: boolean;
  customerLabel: string;
}

export interface OrderDeliveryHistory {
  id: string;
  previousFrom: string;
  previousTo: string;
  newFrom: string;
  newTo: string;
  reason?: string | null;
  changedBy: string;
  changedByName: string;
  changedAt: string;
}

export interface AdminOrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus?: PaymentStatus | null;
  paymentMethod: string;
  totalAmount: number;
  createdAt: string;
  paidAt?: string | null;
  items: OrderItem[];
  shippingAddress?: ShippingAddress | null;
  delivery?: OrderDelivery | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  overrideReason?: string | null;
  overriddenAt?: string | null;
  overriddenByName?: string | null;
  deliveryHistory: OrderDeliveryHistory[];
}

export interface UpdateDeliveryDateRequest {
  deliveryDateFrom: string;
  deliveryDateTo?: string | null;
  reason?: string | null;
}

export type LiveBookingStatus = 'PendingPayment' | 'Confirmed' | 'Cancelled' | 'Expired';
export type LiveSlotType = 'Morning' | 'Evening';

export interface LiveSlotAvailability {
  slotType: string;
  name: string;
  seatCapacity: number;
  seatsBooked: number;
  seatsRemaining: number;
  status: string;
}

export interface LiveDay {
  date: string;
  weekday: string;
  kind: string;
  label: string;
}

export interface AdminLiveBookingListItem {
  id: string;
  status: LiveBookingStatus | string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  weekNumber: number;
  seasonYear: number;
  startDate: string;
  endDate: string;
  slotType: string;
  slotName: string;
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  paymentStatus?: string | null;
  createdAt: string;
  confirmedAt?: string | null;
}

export interface AdminLiveBookingDetail extends AdminLiveBookingListItem {
  reservationExpiresAt?: string | null;
  seatCapacity: number;
  seatsBooked: number;
  seatsRemaining: number;
  breakWeekday?: string | null;
  isBookable: boolean;
  days: LiveDay[];
}

export interface AdminLiveWeek {
  id: string;
  weekNumber: number;
  seasonYear: number;
  startDate: string;
  endDate: string;
  breakWeekday?: string | null;
  isBookable: boolean;
  packagePrice: number;
  slots: LiveSlotAvailability[];
}

export interface AdminCustomerListItem {
  id: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  isActive: boolean;
  signedUpAt: string;
  lastActiveAt: string;
  orderCount: number;
}

