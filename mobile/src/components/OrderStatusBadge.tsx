import { StyleSheet, Text, View } from 'react-native';
import type { OrderStatus } from '../types/orders';
import { fonts, radii } from '../theme';
import { orderStatusColors, orderStatusLabel } from '../utils/orders';

interface OrderStatusBadgeProps {
  status: OrderStatus;
}

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const { bg, ink } = orderStatusColors(status);
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: ink }]}>{orderStatusLabel(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  text: {
    fontFamily: fonts.extraBold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
});
