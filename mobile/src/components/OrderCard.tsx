import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Order } from '../types/orders';
import { colors, fonts, spacing } from '../theme';
import { formatInr } from '../utils/format';
import { formatOrderDate } from '../utils/orders';
import { OrderStatusBadge } from './OrderStatusBadge';

const PLACEHOLDER_COLORS = ['#ffe3ec', '#fff0f4', '#ffeaf1', '#ffffff'];

interface OrderCardProps {
  order: Order;
  index: number;
  onPress: () => void;
}

export function OrderCard({ order, index, onPress }: OrderCardProps) {
  const item = order.items[0];
  const bg = PLACEHOLDER_COLORS[index % PLACEHOLDER_COLORS.length];
  const meta =
    order.status === 'InProduction' && order.estimatedDispatchAt
      ? `Est. dispatch ${formatOrderDate(order.estimatedDispatchAt)}`
      : order.status === 'Delivered'
        ? `Delivered ${formatOrderDate(order.orderedAt)}`
        : `Ordered ${formatOrderDate(order.orderedAt)}`;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={[styles.thumb, { backgroundColor: bg }]}>
        <Text style={styles.initial}>{item?.productName.charAt(0) ?? 'V'}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.ref}>Order #{order.orderNumber}</Text>
        <Text style={styles.name} numberOfLines={1}>
          {item?.productName ?? 'Handmade piece'}
          {item?.category ? ` · ${item.category}` : ''}
        </Text>
        <Text style={styles.meta}>
          Qty {item?.quantity ?? 1} · {formatInr(order.totalAmount)}
        </Text>
        <OrderStatusBadge status={order.status} />
        <Text style={styles.hint}>{meta}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  thumb: {
    width: 70,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontFamily: fonts.extraBold,
    fontSize: 28,
    color: colors.pink,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  ref: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 0.5,
  },
  name: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.ink,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
});
