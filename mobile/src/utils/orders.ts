import type { OrderStatus as ApiOrderStatus } from '../api/orders';
import type { OrderPipelineStep, OrderStatus } from '../types/orders';

/** Maps live API order statuses onto the production-pipeline UI model. */
export function toPipelineStatus(status: ApiOrderStatus | string): OrderStatus {
  switch (status) {
    case 'PendingPayment':
    case 'Paid':
    case 'Confirmed':
      return 'Confirmed';
    case 'InProduction':
      return 'InProduction';
    case 'Shipped':
      return 'Dispatched';
    case 'Delivered':
      return 'Delivered';
    case 'Cancelled':
    case 'PaymentFailed':
      return 'Cancelled';
    default:
      return 'Confirmed';
  }
}

const STATUS_RANK: Record<OrderStatus, number> = {
  Confirmed: 0,
  InProduction: 1,
  Ready: 2,
  Dispatched: 3,
  Delivered: 4,
  Cancelled: -1,
};

const PIPELINE = [
  { rank: 0, label: 'Order confirmed' },
  { rank: 1, label: 'In production queue' },
  { rank: 1, label: 'Making' },
  { rank: 2, label: 'Ready' },
  { rank: 3, label: 'Dispatched' },
  { rank: 4, label: 'Delivered' },
] as const;

export function orderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case 'Confirmed':
      return 'ORDER CONFIRMED';
    case 'InProduction':
      return 'IN PRODUCTION';
    case 'Ready':
      return 'READY';
    case 'Dispatched':
      return 'DISPATCHED';
    case 'Delivered':
      return 'DELIVERED';
    case 'Cancelled':
      return 'CANCELLED';
  }
}

export function orderStatusColors(status: OrderStatus): { bg: string; ink: string } {
  switch (status) {
    case 'Delivered':
      return { bg: '#f3f8f4', ink: '#1c8a4a' };
    case 'Dispatched':
      return { bg: '#f3e8ff', ink: '#7b4fd1' };
    case 'InProduction':
      return { bg: '#fff3cf', ink: '#7a5c05' };
    case 'Ready':
      return { bg: '#ffe3ec', ink: '#c8145a' };
    case 'Cancelled':
      return { bg: '#f7f2f4', ink: '#8a7076' };
    default:
      return { bg: '#f7f4f5', ink: '#221a1e' };
  }
}

export function formatOrderDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
}

export function formatDeliveryRange(from?: string | null, to?: string | null): string | null {
  if (!from) return null;
  const start = formatOrderDate(from);
  if (!to || to === from) return start;
  return `${start}–${formatOrderDate(to)}`;
}

function stepWhen(
  label: string,
  orderedAt: string,
  estimatedDispatchAt?: string | null,
  estimatedDeliveryFrom?: string | null,
  estimatedDeliveryTo?: string | null,
): string {
  if (label === 'Order confirmed') return `${formatOrderDate(orderedAt)} · payment verified`;
  if (label === 'In production queue') return formatOrderDate(orderedAt);
  if (label === 'Making') return 'In progress · Vivi';
  if (label === 'Ready') {
    return estimatedDispatchAt ? `Expected ${formatOrderDate(estimatedDispatchAt)}` : 'Pending';
  }
  if (label === 'Dispatched') {
    return estimatedDispatchAt ? `Expected ${formatOrderDate(estimatedDispatchAt)}` : 'Pending';
  }
  return formatDeliveryRange(estimatedDeliveryFrom, estimatedDeliveryTo) ?? 'Pending';
}

export function buildOrderPipeline(
  status: OrderStatus,
  orderedAt: string,
  estimatedDispatchAt?: string | null,
  estimatedDeliveryFrom?: string | null,
  estimatedDeliveryTo?: string | null,
): OrderPipelineStep[] {
  const rank = STATUS_RANK[status] ?? 0;
  let currentIndex = PIPELINE.findIndex((step, index) => {
    if (rank < step.rank) return false;
    const next = PIPELINE[index + 1];
    return !next || rank < next.rank;
  });
  if (currentIndex < 0) currentIndex = 0;

  return PIPELINE.map((step, index) => ({
    label: step.label,
    when: stepWhen(step.label, orderedAt, estimatedDispatchAt, estimatedDeliveryFrom, estimatedDeliveryTo),
    done: rank > step.rank || (rank === step.rank && index < currentIndex),
    current: index === currentIndex && rank >= 0,
  }));
}
