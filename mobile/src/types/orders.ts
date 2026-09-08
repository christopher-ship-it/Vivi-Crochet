export type OrderStatus =
  | 'Confirmed'
  | 'InProduction'
  | 'Ready'
  | 'Dispatched'
  | 'Delivered'
  | 'Cancelled';

export interface OrderItem {
  productName: string;
  category: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  orderedAt: string;
  estimatedDispatchAt?: string | null;
  estimatedDeliveryFrom?: string | null;
  estimatedDeliveryTo?: string | null;
  totalAmount: number;
  items: OrderItem[];
  trackingNumber?: string | null;
}

export interface OrderPipelineStep {
  label: string;
  when: string;
  done: boolean;
  current: boolean;
}
