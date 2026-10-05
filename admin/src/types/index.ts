export type CourseType = 'DigitalCourse' | 'ProjectCourse' | 'Bundle';
export type CourseStatus = 'Draft' | 'Published';
export type VideoStatus = 'Draft' | 'Published';
export type VideoTranscodeStatus = 'None' | 'Queued' | 'Processing' | 'Ready' | 'Failed';


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
  description?: string | null;
  about?: string | null;
  price: number;
  mrp?: number | null;
  /** Saved prices for other countries (admin view). */
  marketPrices?: CoursePrice[] | null;
  accessDays: number;
  renewalPercentage: number;
  languages?: string | null;
  thumbnailUrl?: string | null;
  sortOrder: number;
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
  completedPurchaseCount?: number;
}

/** A course's price in a country other than India (US, in USD). */
export interface CoursePrice {
  countryCode: string;
  currency?: string;
  price: number;
  mrp?: number | null;
  /** Founding-membership launch price (bundles only). */
  launchPrice?: number | null;
  regularPriceAfterLaunch?: number | null;
}

export interface CourseRequest {
  name: string;
  categoryId?: string | null;
  type: CourseType;
  level?: string | null;
  description?: string | null;
  about?: string | null;
  price: number;
  mrp?: number | null;
  accessDays: number;
  renewalPercentage: number;
  languages?: string | null;
  sortOrder?: number;
  includedCourseIds?: string[] | null;
  launchPrice?: number | null;
  launchLimit?: number | null;
  regularPriceAfterLaunch?: number | null;
  /** Prices for other countries. Omit to leave unchanged; a list replaces the saved set. */
  marketPrices?: CoursePrice[];
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
  playableFileSizeBytes?: number | null;
  playableContentType?: string | null;
  transcodeStatus?: VideoTranscodeStatus;
  transcodeError?: string | null;
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

export interface ProductVariantSummary {
  id: string;
  productCode?: string | null;
  colourName?: string | null;
  colourHex?: string | null;
  price: number;
  mrp?: number | null;
  imageUrl?: string | null;
  availableStock: number;
  status: ProductStatus;
  sortOrder: number;
}

export interface Product {
  id: string;
  productCode?: string | null;
  name: string;
  category: string;
  description?: string | null;
  price: number;
  mrp?: number | null;
  imageUrl?: string | null;
  images?: ProductImage[];
  spec1?: string | null;
  spec2?: string | null;
  ballWeight?: string | null;
  yarnLength?: string | null;
  crochetHookSize?: string | null;
  fibreBlend?: string | null;
  yarnWeight?: string | null;
  needleSize?: string | null;
  colourName?: string | null;
  colourHex?: string | null;
  parentProductId?: string | null;
  variantOptionName?: string | null;
  variantCount?: number;
  variants?: ProductVariantSummary[];
  courseId?: string | null;
  linkedCourse?: LinkedCourseSummary | null;
  recommendedEssentials?: RecommendedEssentialSummary[];
  sortOrder: number;
  productType: ProductType;
  availableStock: number;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProductRequest {
  name: string;
  productCode?: string | null;
  category: string;
  description?: string | null;
  price: number;
  mrp?: number | null;
  spec1?: string | null;
  spec2?: string | null;
  ballWeight?: string | null;
  yarnLength?: string | null;
  crochetHookSize?: string | null;
  fibreBlend?: string | null;
  yarnWeight?: string | null;
  needleSize?: string | null;
  colourName?: string | null;
  colourHex?: string | null;
  parentProductId?: string | null;
  variantOptionName?: string | null;
  courseId?: string | null;
  sortOrder: number;
  productType: ProductType;
  availableStock: number;
  recommendedEssentialIds?: string[];
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

export type PaymentSource = 'Product' | 'Course' | 'Live';

export interface AdminPaymentListItem {
  id: string;
  orderId: string;
  orderNumber: string;
  source: PaymentSource;
  titleSummary: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  providerOrderId: string;
  providerPaymentId?: string | null;
  signatureVerified: boolean;
  createdAt: string;
  completedAt?: string | null;
}

export interface AdminPaymentSourceTotals {
  source: PaymentSource;
  currency: string;
  collected: number;
  capturedCount: number;
  pendingCount: number;
  failedCount: number;
  refunded: number;
}

export interface AdminPaymentsResponse {
  payments: AdminPaymentListItem[];
  totals: AdminPaymentSourceTotals[];
}

export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus?: PaymentStatus | null;
  totalAmount: number;
  /** Currency of totalAmount (INR or USD). */
  currency?: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone: string;
  /** Snapshot-based line title(s), e.g. "Pink Yarn + 2 more". */
  titleSummary?: string | null;
  /** Every line as "Name × qty", joined with "; ". */
  itemsDetail?: string | null;
  /** Product codes of the shop items, comma separated. */
  productCodes?: string | null;
  /** Total units across shop items. */
  productQuantity?: number;
  /** Handmade, Essentials or Combined; null without shop items. */
  productRoom?: 'Handmade' | 'Essentials' | 'Combined' | null;
  createdAt: string;
  hasPhysicalItems: boolean;
  hasCourseItems?: boolean;
  hasLiveItems?: boolean;
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
  /** Currency of the amounts (INR or USD). */
  currency?: string;
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
export type LiveSlotType = 'Morning' | 'Evening' | 'Extra1' | 'Extra2' | 'Extra3';

export interface LiveSlotAvailability {
  slotType: string;
  name: string;
  hours?: string;
  /** This week's own timing, when it differs from the session default. */
  hoursOverride?: string | null;
  seatCapacity: number;
  seatsBooked: number;
  seatsRemaining: number;
  isBlocked?: boolean;
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
  /** Price customers pay for this week (the studio price unless overridden). */
  packagePrice: number;
  priceOverride?: number | null;
  language: string;
  languageOverride?: string | null;
  level: string;
  levelOverride?: string | null;
  tutorName?: string | null;
  tutorPhotoUrl?: string | null;
  /** True when this week has its own tutor name/photo instead of the shared default. */
  hasCustomTutor: boolean;
  slots: LiveSlotAvailability[];
}

export interface AdminLiveSession {
  slotType: LiveSlotType;
  name: string;
  hours: string;
  isEnabled: boolean;
  /** Morning and Evening are always on. */
  isCore: boolean;
}

export interface AdminLiveSettings {
  packagePrice: number;
  hoursPerClassDay: number;
  language: string;
  level: string;
  sessions: AdminLiveSession[];
}

/** The shared tutor name/photo shown for every Live week without its own override. */
export interface AdminLiveTutorDefault {
  tutorName: string;
  tutorPhotoUrl?: string | null;
}

export interface AdminCustomerListItem {
  id: string;
  /** Customer-facing ID, e.g. VC-K7M2QX. */
  customerCode?: string | null;
  /** Founding-member ID, e.g. VV-KQTD-007. Null unless the customer is a founding member. */
  memberCode?: string | null;
  fullName: string;
  phoneNumber: string;
  email: string;
  isActive: boolean;
  signedUpAt: string;
  lastActiveAt: string;
  orderCount: number;
  track: string;
  age: number | null;
  country: string | null;
  state: string | null;
  city: string | null;
}

export interface AdminSpecialOfferCourse {
  id: string;
  name: string;
  price: number;
}

export interface AdminSpecialOffer {
  courseId: string;
  offerName: string;
  priceLabel: string;
  badgeText?: string | null;
  endedBadgeText?: string | null;
  isActive: boolean;
  launchPrice: number;
  launchLimit: number;
  regularPriceAfterLaunch: number;
  mrp: number;
  accessDurationDays: number;
  completedPurchaseCount: number;
  remaining: number;
  revenue: number;
  /** Revenue from orders paid in US dollars. */
  revenueUsd?: number;
  /** The membership's US prices in USD, or null when it is not sold in the US. */
  usPrice?: AdminSpecialOfferMarketPrice | null;
  viralProjectCourseId?: string | null;
  viralProjectCourseName?: string | null;
  includedCourses: AdminSpecialOfferCourse[];
}

export interface AdminSpecialOfferMarketPrice {
  launchPrice: number;
  regularPriceAfterLaunch: number;
  mrp: number;
}

export interface AdminSpecialOfferRequest {
  offerName: string;
  priceLabel?: string;
  badgeText?: string | null;
  endedBadgeText?: string | null;
  isActive: boolean;
  launchPrice: number;
  launchLimit: number;
  regularPriceAfterLaunch: number;
  mrp: number;
  accessDurationDays: number;
  viralProjectCourseId?: string | null;
  /** US prices in USD. Omit to leave unchanged. */
  usPrice?: AdminSpecialOfferMarketPrice | null;
  /** Stop selling the membership in the US. */
  removeUsPrice?: boolean;
  /** Included courses in display order (reorder only). */
  includedCourseIds?: string[];
}

export interface FoundingMember {
  id: string;
  memberNumber: number;
  /** Founding-member ID, e.g. VV-KQTD-007. */
  memberCode?: string | null;
  /** The member's customer ID, e.g. VC-K7M2QX. */
  customerCode?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  joinedDate: string;
  expiryDate: string;
  amountPaid: number;
  /** Currency the member paid in (INR or USD). */
  currency?: string;
  orderNumber: string;
  isActive: boolean;
  viralProjectCourseName?: string | null;
}

export interface FoundingMemberListResponse {
  totalCount: number;
  page: number;
  pageSize: number;
  items: FoundingMember[];
}


export interface AdminStudentCode {
  id: string;
  code: string;
  /** Who the code is for, e.g. a college name. */
  label: string;
  isActive: boolean;
  /** Null means unlimited. */
  maxUses?: number | null;
  usedCount: number;
  expiresAt?: string | null;
  isExpired: boolean;
  createdAt: string;
}

export interface AdminStudentOffer {
  courseId: string;
  studentPrice: number;
  /** Dollar student price for US buyers; null when student codes are not available in the US. */
  studentPriceUsd?: number | null;
  /** True once the membership has US pricing (set on the Launch offer tab). */
  usPriceConfigured: boolean;
  accessDurationDays: number;
  /** Students enrolled so far. They are not part of the launch offer's 100. */
  enrolledCount: number;
  revenue: number;
  revenueUsd: number;
  codes: AdminStudentCode[];
}

export interface AdminStudentCodeRequest {
  /** Blank on create generates one like VIVISTUDENT4821. */
  code?: string | null;
  label: string;
  isActive: boolean;
  maxUses?: number | null;
  expiresAt?: string | null;
}

export interface AdminStudentMember {
  id: string;
  memberNumber: number;
  /** Student member ID, e.g. VS-KQTD-007. */
  memberCode?: string | null;
  customerCode?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  studentCode?: string | null;
  studentLabel?: string | null;
  joinedDate: string;
  expiryDate: string;
  amountPaid: number;
  /** Currency the student paid in (INR or USD). */
  currency?: string;
  orderNumber: string;
  isActive: boolean;
}

export interface AdminStudentMemberListResponse {
  totalCount: number;
  page: number;
  pageSize: number;
  items: AdminStudentMember[];
}

export interface OtpDayCount {
  /** yyyy-MM-dd, India calendar day. */
  date: string;
  requested: number;
  verified: number;
}

export interface OtpPhoneCount {
  /** Phone with all but the last four digits hidden. */
  phone: string;
  requests: number;
  verified: number;
}

export interface OtpRecentRequest {
  requestedAt: string;
  phone: string;
  status: 'Verified' | 'Pending' | 'Expired';
  attempts: number;
}

export interface OtpStats {
  totalAllTime: number;
  verifiedAllTime: number;
  firstRequestedAt?: string | null;
  today: number;
  last7Days: number;
  last30Days: number;
  verifiedToday: number;
  verifiedLast7Days: number;
  verifiedLast30Days: number;
  uniquePhonesLast30Days: number;
  daily: OtpDayCount[];
  topPhonesLast7Days: OtpPhoneCount[];
  recent: OtpRecentRequest[];
}

export interface OtpDayHistory {
  /** yyyy-MM-dd, India calendar day. */
  date: string;
  requested: number;
  verified: number;
  uniquePhones: number;
}

export interface OtpMonthHistory {
  /** yyyy-MM. */
  month: string;
  requested: number;
  verified: number;
  uniquePhones: number;
  activeDays: number;
}

export interface OtpHistory {
  daily: OtpDayHistory[];
  monthly: OtpMonthHistory[];
  requests: OtpRecentRequest[];
}

export interface AdminIntroVideo {
  /** True once a compressed video exists for the app to play. */
  hasVideo: boolean;
  isEnabled: boolean;
  fileName?: string | null;
  uploadedFileSizeBytes?: number | null;
  playableFileSizeBytes?: number | null;
  /** State of the newest upload. */
  status: 'None' | 'Queued' | 'Processing' | 'Ready' | 'Failed';
  error?: string | null;
  version: number;
  updatedAt?: string | null;
  /** Temporary link to watch what the app plays. */
  previewUrl?: string | null;
}

export interface IntroVideoUploadTicket {
  uploadUrl: string;
  expiresAt: string;
  blobPath: string;
  maxFileSizeBytes: number;
}
