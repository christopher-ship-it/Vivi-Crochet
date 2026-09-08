import { apiRequest } from './client';

export type OrderItemType = 'Product' | 'Course' | 'CourseBundle';
export type OrderStatus =
  | 'PendingPayment'
  | 'Paid'
  | 'Confirmed'
  | 'InProduction'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled'
  | 'PaymentFailed';

export interface CreateOrderItemInput {
  itemType: OrderItemType;
  productId?: string;
  courseId?: string;
  quantity?: number;
}

export interface ShippingAddressInput {
  fullName: string;
  phoneNumber: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  state: string;
  pinCode: string;
  country?: string;
}

export interface DeliveryQuote {
  isCoimbatore: boolean;
  locationLabel: string;
  minDays: number;
  maxDays: number;
  summary: string;
  estimatedDeliveryDateFrom: string;
  estimatedDeliveryDateTo: string;
  paymentMethod: string;
}

export interface CreateOrderResponse {
  orderId: string;
  orderNumber: string;
  razorpayOrderId: string;
  razorpayKeyId: string;
  amountPaise: number;
  currency: string;
  totalAmount: number;
  paymentMethod?: string;
  delivery?: DeliveryQuote | null;
}

export interface OrderItemResponse {
  id: string;
  itemType: OrderItemType;
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

export interface OrderResponse {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  currency: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingAmount: number;
  totalAmount: number;
  paymentMethod?: string;
  paymentStatus?: string | null;
  razorpayOrderId?: string | null;
  createdAt: string;
  paidAt?: string | null;
  confirmedAt?: string | null;
  items: OrderItemResponse[];
  shippingAddress?: ShippingAddress | null;
  delivery?: OrderDelivery | null;
}

export async function quoteDelivery(
  items: CreateOrderItemInput[],
  shippingAddress: ShippingAddressInput,
): Promise<DeliveryQuote> {
  return apiRequest<DeliveryQuote>('/api/orders/delivery-quote', {
    method: 'POST',
    body: JSON.stringify({ items, shippingAddress }),
  });
}

export async function createOrder(
  items: CreateOrderItemInput[],
  options?: {
    shippingAddress?: ShippingAddressInput;
    paymentMethod?: string;
    saveShippingAddress?: boolean;
  },
): Promise<CreateOrderResponse> {
  return apiRequest<CreateOrderResponse>('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      items,
      paymentMethod: options?.paymentMethod ?? 'OnlinePayment',
      shippingAddress: options?.shippingAddress,
      saveShippingAddress: options?.saveShippingAddress ?? true,
    }),
  });
}

export async function getOrder(orderId: string): Promise<OrderResponse> {
  return apiRequest<OrderResponse>(`/api/orders/${orderId}`);
}

export async function listMyOrders(): Promise<OrderResponse[]> {
  return apiRequest<OrderResponse[]>('/api/orders');
}
