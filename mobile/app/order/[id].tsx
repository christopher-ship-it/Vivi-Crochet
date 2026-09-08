import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getOrder, type OrderResponse } from '../../src/api/orders';
import { ApiClientError } from '../../src/api/client';
import { OrderPipeline } from '../../src/components/OrderPipeline';
import { OrderStatusBadge } from '../../src/components/OrderStatusBadge';
import { EmptyView, ErrorView, LoadingView } from '../../src/components/StateViews';
import { colors, fonts, radii, spacing } from '../../src/theme';
import { formatInr } from '../../src/utils/format';
import {
  buildOrderPipeline,
  formatDeliveryRange,
  formatOrderDate,
  toPipelineStatus,
} from '../../src/utils/orders';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setOrder(await getOrder(id));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load this order.');
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingView message="Loading order…" />;
  if (error || !order) {
    return <ErrorView message={error ?? 'Order not found.'} onRetry={load} />;
  }

  const pipelineStatus = toPipelineStatus(order.status);
  const pipeline = buildOrderPipeline(
    pipelineStatus,
    order.createdAt,
    order.delivery?.systemTo ?? order.delivery?.expectedFrom,
    order.delivery?.expectedFrom,
    order.delivery?.expectedTo,
  );
  const firstItem = order.items?.[0];

  return (
    <>
      <Stack.Screen options={{ title: 'Order tracking', headerShadowVisible: false }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>ORDER #{order.orderNumber}</Text>
        <View style={styles.statusRow}>
          <OrderStatusBadge status={pipelineStatus} />
        </View>

        <View style={styles.panel}>
          {(order.items ?? []).map((item, index) => (
            <View
              key={item.id}
              style={[styles.itemRow, index === (order.items?.length ?? 0) - 1 && styles.itemRowLast]}
            >
              <View style={styles.thumb}>
                <Text style={styles.initial}>
                  {(item.itemNameSnapshot || firstItem?.itemNameSnapshot || 'V').charAt(0)}
                </Text>
              </View>
              <View style={styles.itemBody}>
                <Text style={styles.itemName}>{item.itemNameSnapshot}</Text>
                <Text style={styles.itemMeta}>
                  Qty {item.quantity} · {formatInr(item.totalAmount)}
                </Text>
              </View>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total paid</Text>
            <Text style={styles.totalValue}>{formatInr(order.totalAmount)}</Text>
          </View>
        </View>

        <View style={styles.datesCard}>
          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>Ordered</Text>
            <Text style={styles.dateValue}>{formatOrderDate(order.createdAt)}</Text>
          </View>
          {order.delivery?.expectedFrom ? (
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Estimated delivery</Text>
              <Text style={styles.dateValue}>
                {formatDeliveryRange(order.delivery.expectedFrom, order.delivery.expectedTo) ?? '—'}
              </Text>
            </View>
          ) : null}
          {order.delivery?.customerLabel ? (
            <Text style={styles.deliveryNote}>{order.delivery.customerLabel}</Text>
          ) : null}
        </View>

        {order.shippingAddress ? (
          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Delivery address</Text>
            <Text style={styles.addressText}>
              {order.shippingAddress.fullName}{'\n'}
              {order.shippingAddress.addressLine1}
              {order.shippingAddress.addressLine2 ? `\n${order.shippingAddress.addressLine2}` : ''}
              {'\n'}
              {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
              {order.shippingAddress.pinCode}
            </Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Production status</Text>
        <OrderPipeline steps={pipeline} />

        <Text style={styles.note}>
          Every piece is crocheted by hand after your order is placed, so dispatch follows our
          production queue.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  content: {
    padding: spacing.md,
  },
  eyebrow: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.pink,
  },
  statusRow: {
    marginTop: 10,
    marginBottom: spacing.md,
  },
  panel: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: spacing.md,
  },
  itemRow: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.softBorder,
  },
  itemRowLast: {
    borderBottomWidth: 0,
    marginBottom: 0,
    paddingBottom: 0,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.pinkSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.pink,
  },
  itemBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  itemName: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  itemMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.softBorder,
  },
  totalLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.muted,
  },
  totalValue: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.pink,
  },
  datesCard: {
    backgroundColor: colors.pinkSoft,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: spacing.md,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.softBorder,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateLabel: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
  },
  dateValue: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.ink,
  },
  deliveryNote: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.pink,
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 10,
  },
  addressText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 21,
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
    marginTop: spacing.md,
  },
});
