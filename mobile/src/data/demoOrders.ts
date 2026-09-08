import type { Order } from '../types/orders';

/** Prototype sample orders — replaced by GET /api/orders when checkout is live. */
export const DEMO_ORDERS: Order[] = [
  {
    id: 'ord-1004',
    orderNumber: 1004,
    status: 'InProduction',
    orderedAt: '2026-08-24T10:30:00Z',
    estimatedDispatchAt: '2026-09-19T00:00:00Z',
    estimatedDeliveryFrom: '2026-09-22T00:00:00Z',
    estimatedDeliveryTo: '2026-09-24T00:00:00Z',
    totalAmount: 909,
    trackingNumber: null,
    items: [
      {
        productName: 'Puffin Buddy',
        category: 'Amigurumi',
        quantity: 1,
        unitPrice: 899,
      },
    ],
  },
  {
    id: 'ord-1003',
    orderNumber: 1003,
    status: 'Dispatched',
    orderedAt: '2026-08-10T14:00:00Z',
    estimatedDispatchAt: '2026-08-28T00:00:00Z',
    estimatedDeliveryFrom: '2026-08-30T00:00:00Z',
    estimatedDeliveryTo: '2026-09-01T00:00:00Z',
    totalAmount: 1220,
    trackingNumber: 'VIVI-884291-IN',
    items: [
      {
        productName: 'Grey Elephant',
        category: 'Amigurumi',
        quantity: 1,
        unitPrice: 1150,
      },
    ],
  },
  {
    id: 'ord-1002',
    orderNumber: 1002,
    status: 'Delivered',
    orderedAt: '2026-07-18T09:15:00Z',
    estimatedDispatchAt: '2026-07-25T00:00:00Z',
    estimatedDeliveryFrom: '2026-07-28T00:00:00Z',
    estimatedDeliveryTo: '2026-07-30T00:00:00Z',
    totalAmount: 809,
    trackingNumber: 'VIVI-772104-IN',
    items: [
      {
        productName: 'Plush Turtle',
        category: 'Amigurumi',
        quantity: 1,
        unitPrice: 749,
      },
    ],
  },
];

export function getDemoOrder(id: string): Order | undefined {
  return DEMO_ORDERS.find((o) => o.id === id);
}
