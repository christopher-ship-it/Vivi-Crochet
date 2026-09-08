import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { listProductCategories, listProducts } from '../../src/api/products';
import { listMyOrders, type OrderResponse } from '../../src/api/orders';
import { ApiClientError } from '../../src/api/client';
import { useShoppingSession } from '../../src/auth/SessionContext';
import { useCart } from '../../src/cart/CartContext';
import { MyOrderCard } from '../../src/components/MyOrderCard';
import { ProductCard } from '../../src/components/ProductCard';
import { EmptyView, ErrorView, LoadingView } from '../../src/components/StateViews';
import { useTabDockClearance } from '../../src/components/PremiumTabBar';
import type { Product } from '../../src/types';
import { colors, fonts, spacing } from '../../src/theme';
import { applyStatusBar } from '../../src/utils/statusBar';

type ShopTab = 'products' | 'orders';

export default function ShopScreen() {
  const router = useRouter();
  const { shopTab: shopTabParam } = useLocalSearchParams<{ shopTab?: string | string[] }>();
  const shopTab = Array.isArray(shopTabParam) ? shopTabParam[0] : shopTabParam;
  const { itemCount } = useCart();
  const { isAuthenticated } = useShoppingSession();
  const dockClearance = useTabDockClearance();
  const [tab, setTab] = useState<ShopTab>(shopTab === 'orders' ? 'orders' : 'products');
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersRefreshing, setOrdersRefreshing] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const hasLoadedOnce = useRef(false);
  const requestId = useRef(0);

  useFocusEffect(
    useCallback(() => {
      applyStatusBar('dark');
    }, []),
  );

  useEffect(() => {
    if (shopTab === 'orders' || shopTab === 'products') {
      setTab(shopTab);
    }
  }, [shopTab]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async (isRefresh = false) => {
    const id = ++requestId.current;
    const showFullScreen = !hasLoadedOnce.current && !isRefresh;
    if (showFullScreen) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [cats, data] = await Promise.all([
        listProductCategories(),
        listProducts(
          activeCategory === 'All' ? undefined : activeCategory,
          debouncedQuery || undefined,
        ),
      ]);
      if (id !== requestId.current) return;
      setCategories(cats);
      setProducts(data);
      hasLoadedOnce.current = true;
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof ApiClientError ? err.message : 'Failed to load products.');
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [activeCategory, debouncedQuery]);

  const loadOrders = useCallback(async (isRefresh = false) => {
    if (!isAuthenticated) {
      setOrders([]);
      setOrdersLoading(false);
      setOrdersError(null);
      return;
    }
    if (isRefresh) setOrdersRefreshing(true);
    else setOrdersLoading(true);
    setOrdersError(null);
    try {
      setOrders(await listMyOrders());
    } catch (err) {
      setOrdersError(err instanceof ApiClientError ? err.message : 'Failed to load your orders.');
    } finally {
      setOrdersLoading(false);
      setOrdersRefreshing(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (tab === 'products') void load();
  }, [load, tab]);

  useEffect(() => {
    if (tab === 'orders') void loadOrders();
  }, [loadOrders, tab]);

  const tabs = ['All', ...categories.filter((c) => c !== 'All')];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitles}>
            <Text style={styles.title}>VIVI&apos;s Magic Products</Text>
          </View>
          <Pressable style={styles.cartBtn} onPress={() => router.push('/cart')}>
            <Text style={styles.cartBtnLabel}>Cart</Text>
            {itemCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{itemCount > 99 ? '99+' : itemCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <View style={styles.mainTabs}>
          <Pressable
            style={[styles.mainTab, tab === 'products' && styles.mainTabActive]}
            onPress={() => setTab('products')}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'products' }}
          >
            <Text style={[styles.mainTabText, tab === 'products' && styles.mainTabTextActive]}>
              Products
            </Text>
          </Pressable>
          <Pressable
            style={[styles.mainTab, tab === 'orders' && styles.mainTabActive]}
            onPress={() => setTab('orders')}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'orders' }}
          >
            <Text style={[styles.mainTabText, tab === 'orders' && styles.mainTabTextActive]}>
              My orders
            </Text>
          </Pressable>
        </View>

        {tab === 'products' && (
          <>
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Search bags, toys, blankets…"
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              onSubmitEditing={() => load()}
            />
            <View style={styles.categoryTabs}>
              {tabs.map((cat) => (
                <Pressable
                  key={cat}
                  style={[styles.categoryTab, activeCategory === cat && styles.categoryTabActive]}
                  onPress={() => setActiveCategory(cat)}
                >
                  <Text
                    style={[
                      styles.categoryTabText,
                      activeCategory === cat && styles.categoryTabTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>

      {tab === 'products' ? (
        loading && !refreshing ? (
          <LoadingView message="Loading shop…" />
        ) : error && products.length === 0 ? (
          <ErrorView message={error} onRetry={() => load()} />
        ) : (
          <FlatList
            data={products}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: dockClearance + 16 },
            ]}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.pink} />
            }
            ListEmptyComponent={
              <EmptyView title="No products found" message="Try another category or search term." />
            }
            renderItem={({ item, index }) => (
              <ProductCard
                product={item}
                index={index}
                onPress={() => router.push(`/product/${item.id}`)}
              />
            )}
          />
        )
      ) : !isAuthenticated ? (
        <View style={[styles.ordersEmpty, { paddingBottom: dockClearance }]}>
          <ErrorView
            title="Sign in to see your orders"
            message="Your order history is tied to your account."
            actionLabel="Sign in"
            onAction={() =>
              router.push({
                pathname: '/login',
                params: { returnTo: '/(tabs)/shop?shopTab=orders' },
              })
            }
          />
        </View>
      ) : ordersLoading && !ordersRefreshing ? (
        <LoadingView message="Loading your orders…" />
      ) : ordersError && orders.length === 0 ? (
        <ErrorView message={ordersError} onRetry={() => loadOrders()} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.ordersList, { paddingBottom: dockClearance + 16 }]}
          refreshControl={
            <RefreshControl
              refreshing={ordersRefreshing}
              onRefresh={() => loadOrders(true)}
              tintColor={colors.pink}
            />
          }
          ListEmptyComponent={
            <View style={styles.ordersEmpty}>
              <EmptyView
                title="No orders yet"
                message="When you complete checkout, your handmade order history will appear here."
              />
            </View>
          }
          renderItem={({ item }) => <MyOrderCard order={item} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.cream,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.softBorder,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerTitles: { flex: 1 },
  title: { fontFamily: fonts.extraBold, fontSize: 20, color: colors.ink, letterSpacing: -0.3 },
  cartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.pink,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  cartBtnLabel: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.white },
  cartBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: { fontFamily: fonts.semiBold, fontSize: 10, color: colors.pink },
  mainTabs: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.softBorder,
    zIndex: 2,
  },
  mainTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  mainTabActive: { backgroundColor: colors.pink },
  mainTabText: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.muted },
  mainTabTextActive: { color: colors.white },
  search: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
  },
  categoryTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  categoryTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.softBorder,
  },
  categoryTabActive: { backgroundColor: colors.pinkSoft, borderColor: colors.pink },
  categoryTabText: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  categoryTabTextActive: { fontFamily: fonts.semiBold, color: colors.ink },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  row: { gap: spacing.md, marginBottom: spacing.md, alignItems: 'flex-start' },
  ordersList: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  ordersEmpty: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg },
});
