import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getOrder, type OrderResponse } from '../src/api/orders';
import { ApiClientError } from '../src/api/client';
import { ErrorView, LoadingView } from '../src/components/StateViews';
import { colors, fonts, radii, spacing } from '../src/theme';
import { formatInr } from '../src/utils/format';

export default function OrderConfirmationScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      setOrder(await getOrder(orderId));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load order confirmation.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingView message="Loading confirmation…" />;
  if (error || !order) {
    return <ErrorView message={error ?? 'Order not found.'} onRetry={load} />;
  }

  const hasPhysical = order.items.some((i) => i.itemType === 'Product');
  const hasCourse = order.items.some(
    (i) => i.itemType === 'Course' || i.itemType === 'CourseBundle',
  );
  const paidOn =
    order.paidAt || order.confirmedAt
      ? new Date(order.paidAt ?? order.confirmedAt!).toLocaleString('en-IN')
      : null;

  return (
    <>
      <Stack.Screen options={{ title: 'Booking confirmed', headerShadowVisible: false }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 36 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.checkMark}>
            <Text style={styles.checkMarkText}>✓</Text>
          </View>
          <Text style={styles.eyebrow}>PAYMENT RECEIVED</Text>
          <Text style={styles.title}>Booking confirmed</Text>
          <Text style={styles.sub}>
            Thank you. You will be notified with this order summary shortly.
          </Text>
        </View>

        <View style={styles.orderChip}>
          <Text style={styles.orderChipLabel}>Order number</Text>
          <Text style={styles.orderChipValue}>{order.orderNumber}</Text>
        </View>

        <View style={styles.panel}>
          <Row label="Status" value={order.status} />
          <Row label="Payment" value={order.paymentMethod ?? 'Online Payment'} />
          {paidOn ? <Row label="Paid on" value={paidOn} last /> : null}
        </View>

        <Text style={styles.section}>Order summary</Text>
        <View style={styles.panel}>
          {order.items.map((item, index) => (
            <View
              key={item.id}
              style={[styles.line, index === order.items.length - 1 && styles.lineLast]}
            >
              <View style={styles.lineText}>
                <Text style={styles.itemName}>{item.itemNameSnapshot}</Text>
                <Text style={styles.itemMeta}>
                  Qty {item.quantity}
                  {item.itemType === 'Product' ? '' : ` · ${item.itemType}`}
                </Text>
              </View>
              <Text style={styles.itemPrice}>{formatInr(item.totalAmount)}</Text>
            </View>
          ))}
          <View style={styles.totalStrip}>
            <Text style={styles.totalLabel}>Total paid</Text>
            <Text style={styles.totalValue}>{formatInr(order.totalAmount)}</Text>
          </View>
        </View>

        {order.delivery && (
          <>
            <Text style={styles.section}>Expected delivery</Text>
            <View style={styles.deliveryBanner}>
              <Text style={styles.deliveryEyebrow}>DELIVERY WINDOW</Text>
              <Text style={styles.deliveryHighlight}>{order.delivery.customerLabel}</Text>
              {order.shippingAddress && (
                <Text style={styles.deliveryAddress}>
                  {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
                  {order.shippingAddress.pinCode}
                </Text>
              )}
            </View>
          </>
        )}

        <View style={styles.nextBox}>
          <Text style={styles.nextTitle}>What happens next</Text>
          {hasPhysical && (
            <Text style={styles.nextBody}>
              Products are booked into production. You will get updated when it is shipped.
            </Text>
          )}
          {hasCourse && (
            <Text style={styles.nextBody}>
              Course access is active. Open Learn & Loop to start watching your lessons.
            </Text>
          )}
          <Text style={[styles.nextBody, styles.nextBodyLast]}>
            Check your inbox. We will notify you there with the details.
          </Text>
        </View>

        <Pressable
          style={styles.primaryBtn}
          onPress={() =>
            router.replace(
              hasCourse && !hasPhysical
                ? '/(tabs)/learn'
                : { pathname: '/(tabs)/shop', params: { shopTab: 'orders' } },
            )
          }
        >
          <Text style={styles.primaryText}>
            {hasCourse && !hasPhysical ? 'Go to Learn' : 'Check my orders'}
          </Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  checkMark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  checkMarkText: {
    fontFamily: fonts.extraBold,
    fontSize: 28,
    color: colors.white,
  },
  eyebrow: {
    fontFamily: fonts.extraBold,
    fontSize: 10,
    letterSpacing: 2.2,
    color: colors.pink,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 28,
    color: colors.ink,
    marginTop: 8,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    marginTop: 10,
    lineHeight: 21,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  orderChip: {
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  orderChipLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  orderChipValue: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.ink,
    marginTop: 2,
  },
  panel: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.softBorder,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
  },
  rowValue: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
    flexShrink: 1,
    textAlign: 'right',
  },
  section: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 10,
    marginTop: 4,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.softBorder,
  },
  lineLast: {
    borderBottomWidth: 0,
  },
  lineText: {
    flex: 1,
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
    marginTop: 3,
  },
  itemPrice: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.ink,
  },
  totalStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 14,
    paddingBottom: 10,
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
    fontSize: 22,
    color: colors.pink,
    letterSpacing: -0.3,
  },
  deliveryBanner: {
    backgroundColor: colors.pinkSoft,
    borderRadius: radii.lg,
    padding: 18,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.softBorder,
  },
  deliveryEyebrow: {
    fontFamily: fonts.extraBold,
    fontSize: 10,
    letterSpacing: 1.8,
    color: colors.pink,
  },
  deliveryHighlight: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.ink,
    marginTop: 8,
    letterSpacing: -0.2,
  },
  deliveryAddress: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
  },
  nextBox: {
    backgroundColor: colors.pinkSoft,
    borderWidth: 1,
    borderColor: '#f5d0db',
    borderRadius: radii.lg,
    padding: 18,
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  nextTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 10,
  },
  nextBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 10,
  },
  nextBodyLast: {
    marginBottom: 0,
  },
  primaryBtn: {
    backgroundColor: colors.pink,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryText: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.white,
  },
});
