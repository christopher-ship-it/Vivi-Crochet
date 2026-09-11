import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getOrder, type OrderResponse } from '../src/api/orders';
import { ApiClientError } from '../src/api/client';
import { ErrorView, LoadingView } from '../src/components/StateViews';
import { HeroGradient } from '../src/components/HeroGradient';
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
      ? new Date(order.paidAt ?? order.confirmedAt!).toLocaleString('en-IN', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

  return (
    <>
      <Stack.Screen options={{ title: '', headerShadowVisible: false }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <HeroGradient style={styles.hero}>
          <View style={styles.checkMark}>
            <Text style={styles.checkMarkText}>✓</Text>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.title}>Booking confirmed</Text>
            <Text style={styles.sub}>Payment received · you’re all set</Text>
          </View>
        </HeroGradient>

        <View style={styles.panel}>
          <Row label="Order" value={order.orderNumber} />
          <Row label="Payment" value={order.paymentMethod ?? 'Online'} />
          {paidOn ? <Row label="Paid on" value={paidOn} last={!order.delivery} /> : null}
          {order.delivery ? (
            <Row label="Delivery" value={order.delivery.customerLabel} last />
          ) : null}
        </View>

        <View style={styles.panel}>
          {order.items.map((item, index) => (
            <View
              key={item.id}
              style={[styles.line, index === order.items.length - 1 && styles.lineLast]}
            >
              <View style={styles.lineText}>
                <Text style={styles.itemName} numberOfLines={2}>{item.itemNameSnapshot}</Text>
                <Text style={styles.itemMeta}>Qty {item.quantity}</Text>
              </View>
              <Text style={styles.itemPrice}>{formatInr(item.totalAmount)}</Text>
            </View>
          ))}
          <View style={styles.totalStrip}>
            <Text style={styles.totalLabel}>Total paid</Text>
            <Text style={styles.totalValue}>{formatInr(order.totalAmount)}</Text>
          </View>
        </View>

        <Text style={styles.nextBody}>
          {[
            hasPhysical ? 'Products are booked into production.' : null,
            hasCourse ? 'Course access is active in Learn & Loop.' : null,
            'We’ll email you the order details.',
          ]
            .filter(Boolean)
            .join(' ')}
        </Text>

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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  checkMark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMarkText: {
    fontFamily: fonts.extraBold,
    fontSize: 20,
    color: colors.white,
  },
  heroCopy: {
    flex: 1,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 20,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  panel: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 2,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
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
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
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
    marginTop: 2,
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
    paddingTop: 10,
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
    fontSize: 18,
    color: colors.pink,
    letterSpacing: -0.2,
  },
  nextBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 19,
    marginBottom: spacing.md,
    marginTop: 4,
  },
  primaryBtn: {
    backgroundColor: colors.pink,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.white,
  },
});
