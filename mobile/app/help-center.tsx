import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listMyOrders, type OrderResponse } from '../src/api/orders';
import { useShoppingSession } from '../src/auth/SessionContext';
import { BackButton } from '../src/components/BackButton';
import { colors, fonts, spacing } from '../src/theme';

type HelpTopic = {
  key: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  accentIcon: keyof typeof Ionicons.glyphMap;
  keywords: string[];
  onPress: () => void;
};

function formatHelpOrderDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const day = date.getDate();
  const ordinal =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th';
  const month = date.toLocaleDateString('en-GB', { month: 'short' });
  return `${day}${ordinal} ${month}, ${date.getFullYear()}`;
}

function itemInitial(name: string): string {
  const ch = name.trim().charAt(0);
  return ch ? ch.toUpperCase() : 'V';
}

export default function HelpCenterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useShoppingSession();
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) {
        setOrders([]);
        setOrdersLoading(false);
        return;
      }

      let cancelled = false;
      (async () => {
        setOrdersLoading(true);
        try {
          const list = await listMyOrders();
          if (!cancelled) {
            setOrders(
              list
                .filter((o) => o.status !== 'Cancelled' && o.status !== 'PaymentFailed')
                .slice(0, 8),
            );
          }
        } catch {
          if (!cancelled) setOrders([]);
        } finally {
          if (!cancelled) setOrdersLoading(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [isAuthenticated]),
  );

  const topics: HelpTopic[] = useMemo(
    () => [
      {
        key: 'orders',
        title: 'Order Related',
        icon: 'cart-outline',
        accentIcon: 'help-circle',
        keywords: ['order', 'track', 'return', 'cancel', 'delivery', 'shipping'],
        onPress: () =>
          isAuthenticated
            ? router.push({ pathname: '/(tabs)/shop', params: { shopTab: 'orders' } })
            : router.push({ pathname: '/login', params: { returnTo: '/help-center' } }),
      },
      {
        key: 'shopping',
        title: 'Shopping',
        icon: 'bag-handle-outline',
        accentIcon: 'pricetag',
        keywords: ['shop', 'product', 'cart', 'wishlist', 'size', 'handmade'],
        onPress: () => router.push('/(tabs)/shop'),
      },
      {
        key: 'account',
        title: 'vivi Account',
        icon: 'person-outline',
        accentIcon: 'id-card-outline',
        keywords: ['account', 'profile', 'login', 'password', 'phone', 'email'],
        onPress: () =>
          isAuthenticated
            ? router.push('/profile-settings')
            : router.push({ pathname: '/login', params: { returnTo: '/profile-settings' } }),
      },
      {
        key: 'payments',
        title: 'Payments',
        icon: 'card-outline',
        accentIcon: 'cash-outline',
        keywords: ['payment', 'razorpay', 'refund', 'upi', 'card', 'failed'],
        onPress: () =>
          Alert.alert(
            'Payments',
            'Orders are paid securely online. If a payment failed or you need a refund status, open the order from Orders or contact support with your order number.',
          ),
      },
    ],
    [isAuthenticated, router],
  );

  const filteredTopics = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.keywords.some((k) => k.includes(q) || q.includes(k)),
    );
  }, [query, topics]);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.items.some((i) => i.itemNameSnapshot.toLowerCase().includes(q)),
    );
  }, [orders, query]);

  const showOrdersSection = isAuthenticated && (ordersLoading || filteredOrders.length > 0 || !query.trim());

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <View style={styles.navRow}>
          <BackButton fallbackHref="/(tabs)/profile" />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.titleRow}>
            <Text style={styles.title}>Help center</Text>
            <View style={styles.headsetWrap} accessibilityLabel="Customer support">
              <Ionicons name="headset-outline" size={34} color={colors.pink} />
            </View>
          </View>

          <View style={styles.searchBox}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor="#b0a4a9"
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            <Ionicons name="search" size={20} color="#9a8e93" />
          </View>

          {showOrdersSection ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>For you</Text>
              <Text style={styles.sectionEyebrow}>GET HELP WITH RECENT ORDERS</Text>

              {ordersLoading ? (
                <View style={styles.ordersLoading}>
                  <ActivityIndicator color={colors.pink} />
                </View>
              ) : filteredOrders.length === 0 ? (
                <Text style={styles.emptyOrders}>
                  {query.trim()
                    ? 'No matching orders.'
                    : 'No recent orders yet. Place an order to get quicker help here.'}
                </Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.orderList}
                >
                  {filteredOrders.map((item, index) => (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [
                        styles.orderCard,
                        index < filteredOrders.length - 1 && styles.orderCardGap,
                        pressed && styles.pressed,
                      ]}
                      onPress={() => router.push(`/order/${item.id}`)}
                    >
                      <Text style={styles.orderId} numberOfLines={1}>
                        {item.orderNumber}
                      </Text>
                      <Text style={styles.orderDate}>{formatHelpOrderDate(item.createdAt)}</Text>
                      <View style={styles.thumbRow}>
                        {(item.items ?? []).slice(0, 4).map((line, thumbIndex) => (
                          <View
                            key={line.id}
                            style={[styles.thumb, thumbIndex === 0 && styles.thumbActive]}
                          >
                            <Text style={styles.thumbText}>{itemInitial(line.itemNameSnapshot)}</Text>
                          </View>
                        ))}
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Browse Topics</Text>
            {filteredTopics.length === 0 ? (
              <Text style={styles.emptyOrders}>No topics match your search.</Text>
            ) : (
              <View style={styles.topicGrid}>
                {filteredTopics.map((topic) => (
                  <Pressable
                    key={topic.key}
                    style={({ pressed }) => [styles.topicCard, pressed && styles.pressed]}
                    onPress={topic.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={topic.title}
                  >
                    <View style={styles.topicIconWrap}>
                      <Ionicons name={topic.icon} size={36} color={colors.ink} />
                      <View style={styles.topicAccent}>
                        <Ionicons name={topic.accentIcon} size={12} color={colors.white} />
                      </View>
                    </View>
                    <Text style={styles.topicTitle}>{topic.title}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Need more help?</Text>
            <View style={styles.helpActions}>
              <Pressable
                style={({ pressed }) => [styles.helpActionRow, pressed && styles.pressed]}
                onPress={() => {
                  if (!isAuthenticated) {
                    router.push({ pathname: '/login', params: { returnTo: '/support-chat' } });
                    return;
                  }
                  router.push('/support-chat');
                }}
                accessibilityRole="button"
              >
                <Ionicons name="chatbubbles-outline" size={26} color={colors.ink} />
                <View style={styles.helpActionCopy}>
                  <Text style={styles.helpActionTitle}>Chat with us</Text>
                  <Text style={styles.helpActionSubtitle}>Get instant query assistance</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#b0a4a9" />
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.helpActionRow, pressed && styles.pressed]}
                onPress={() =>
                  void Linking.openURL('mailto:support@vivicrochet01.com?subject=vivi%20support')
                }
                accessibilityRole="button"
              >
                <Ionicons name="headset-outline" size={26} color={colors.ink} />
                <View style={styles.helpActionCopy}>
                  <Text style={styles.helpActionTitle}>Get in touch</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#b0a4a9" />
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.white,
  },
  flex: { flex: 1 },
  navRow: {
    paddingHorizontal: spacing.md,
    marginBottom: 4,
  },
  content: {
    paddingHorizontal: spacing.md,
    gap: 22,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  title: {
    fontFamily: fonts.nunitoBold,
    fontSize: 32,
    lineHeight: 38,
    color: colors.ink,
  },
  headsetWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e6e0e2',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.white,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
    padding: 0,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontFamily: fonts.nunitoBold,
    fontSize: 22,
    color: colors.ink,
  },
  sectionEyebrow: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: '#9a8e93',
    marginTop: -4,
  },
  ordersLoading: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyOrders: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  orderList: {
    paddingVertical: 4,
    paddingRight: spacing.md,
  },
  orderCard: {
    width: 210,
    borderWidth: 1,
    borderColor: '#e6e0e2',
    borderRadius: 14,
    padding: 14,
    backgroundColor: colors.white,
    gap: 6,
  },
  orderCardGap: {
    marginRight: 12,
  },
  orderId: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
  },
  orderDate: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    marginBottom: 6,
  },
  thumbRow: {
    flexDirection: 'row',
    gap: 8,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.pinkSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbActive: {
    borderColor: colors.pink,
  },
  thumbText: {
    fontFamily: fonts.nunitoBold,
    fontSize: 14,
    color: colors.pinkDark,
  },
  topicGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  topicCard: {
    width: '47.5%',
    minHeight: 132,
    borderWidth: 1,
    borderColor: '#e6e0e2',
    borderRadius: 14,
    backgroundColor: '#f7f7f7',
    paddingHorizontal: 14,
    paddingTop: 22,
    paddingBottom: 14,
    justifyContent: 'space-between',
  },
  topicIconWrap: {
    width: 52,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  topicAccent: {
    position: 'absolute',
    right: -2,
    top: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.ink,
    marginTop: 18,
  },
  helpActions: {
    gap: 10,
    marginTop: 2,
  },
  helpActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#e6e0e2',
    borderRadius: 14,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  helpActionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  helpActionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: colors.ink,
  },
  helpActionSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
  },
  pressed: {
    opacity: 0.88,
  },
});
