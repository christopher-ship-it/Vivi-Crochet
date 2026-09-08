import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { OrderResponse, OrderStatus } from '../api/orders';
import { colors, fonts, spacing } from '../theme';
import { formatInr } from '../utils/format';

const STATUS_STYLES: Record<OrderStatus, { label: string; bg: string; ink: string }> = {
  PendingPayment: { label: 'PAYMENT PENDING', bg: '#fff3cf', ink: '#7a5c05' },
  Paid: { label: 'PAID', bg: '#f3f8f4', ink: '#1c8a4a' },
  Confirmed: { label: 'ORDER CONFIRMED', bg: '#ffe3ec', ink: '#c8145a' },
  InProduction: { label: 'IN PRODUCTION', bg: '#fff3cf', ink: '#7a5c05' },
  Shipped: { label: 'SHIPPED', bg: '#f3e8ff', ink: '#7b4fd1' },
  Delivered: { label: 'DELIVERED', bg: '#f3f8f4', ink: '#1c8a4a' },
  Cancelled: { label: 'CANCELLED', bg: '#f7f2f4', ink: '#8a7076' },
  PaymentFailed: { label: 'PAYMENT FAILED', bg: '#fdecec', ink: '#c0392b' },
};

function formatOrderedOn(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

interface MyOrderCardProps {
  order: OrderResponse;
}

export function MyOrderCard({ order }: MyOrderCardProps) {
  const router = useRouter();
  const status = STATUS_STYLES[order.status] ?? {
    label: String(order.status).toUpperCase(),
    bg: '#f7f4f5',
    ink: colors.ink,
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => router.push(`/order/${order.id}`)}
    >
      <View style={styles.head}>
        <Text style={styles.ref}>Order #{order.orderNumber}</Text>
        <View style={[styles.badge, { backgroundColor: status.bg }]}>
          <Text style={[styles.badgeText, { color: status.ink }]}>{status.label}</Text>
        </View>
      </View>

      <Text style={styles.date}>Placed {formatOrderedOn(order.createdAt)}</Text>
      {order.delivery?.customerLabel ? (
        <Text style={styles.date}>{order.delivery.customerLabel}</Text>
      ) : null}

      <View style={styles.items}>
        {(order.items ?? []).map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemName} numberOfLines={2}>
              {item.itemNameSnapshot}
              {item.quantity > 1 ? ` × ${item.quantity}` : ''}
            </Text>
            <Text style={styles.itemPrice}>{formatInr(item.totalAmount)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{formatInr(order.totalAmount)}</Text>
      </View>
      <Text style={styles.viewLink}>View tracking →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: 18,
    padding: spacing.md,
    marginBottom: spacing.sm + 4,
  },
  cardPressed: {
    opacity: 0.92,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  ref: {
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.ink,
    letterSpacing: 0.3,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: {
    fontFamily: fonts.extraBold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  date: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 6,
  },
  items: {
    marginTop: spacing.sm + 2,
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  itemName: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 18,
  },
  itemPrice: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm + 2,
    paddingTop: spacing.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.softBorder,
  },
  totalLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.muted,
  },
  totalValue: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.ink,
  },
  viewLink: {
    marginTop: 10,
    fontFamily: fonts.extraBold,
    fontSize: 12,
    color: colors.pink,
  },
});
