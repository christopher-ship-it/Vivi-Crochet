import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listProductCategories, listProducts } from '../../src/api/products';
import { listMyOrders, type OrderResponse } from '../../src/api/orders';
import { ApiClientError } from '../../src/api/client';
import { useShoppingSession } from '../../src/auth/SessionContext';
import { useCart } from '../../src/cart/CartContext';
import { MyOrderCard } from '../../src/components/MyOrderCard';
import { BrandWordmark } from '../../src/components/BrandWordmark';
import { ProductCard } from '../../src/components/ProductCard';
import { EmptyView, ErrorView, LoadingView } from '../../src/components/StateViews';
import { useTabDockClearance } from '../../src/components/PremiumTabBar';
import type { Product } from '../../src/types';
import { colors, fonts, spacing } from '../../src/theme';
import { applyStatusBar } from '../../src/utils/statusBar';
import { useWishlist } from '../../src/wishlist/WishlistContext';

type ShopTab = 'products' | 'orders';
const WISHLIST_FILTER = 'Wishlist';

export default function ShopScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { shopTab: shopTabParam } = useLocalSearchParams<{ shopTab?: string | string[] }>();
  const shopTab = Array.isArray(shopTabParam) ? shopTabParam[0] : shopTabParam;
  const { itemCount } = useCart();
  const { productIds: wishlistIds } = useWishlist();
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
  const [filterOpen, setFilterOpen] = useState(false);
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
          activeCategory === 'All' || activeCategory === WISHLIST_FILTER
            ? undefined
            : activeCategory,
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

  const tabs = ['All', WISHLIST_FILTER, ...categories.filter((c) => c !== 'All')];
  const filterActive = activeCategory !== 'All';
  const displayedProducts =
    activeCategory === WISHLIST_FILTER
      ? products.filter((p) => wishlistIds.includes(p.id))
      : products;

  function selectCategory(cat: string) {
    setActiveCategory(cat);
    setFilterOpen(false);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <BrandWordmark />
          <View style={styles.brandRight}>
            <Text style={styles.tagline} numberOfLines={1}>
              Handmade for you
            </Text>
            <Pressable
              style={styles.cartBtn}
              onPress={() => router.push('/cart')}
              accessibilityRole="button"
              accessibilityLabel={`Cart${itemCount > 0 ? `, ${itemCount} items` : ''}`}
              hitSlop={8}
            >
              <Ionicons name="cart-outline" size={24} color={colors.ink} />
              {itemCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{itemCount > 99 ? '99+' : itemCount}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.pageIntro}>
          <Text style={styles.title}>Shop Handmade</Text>
          <Text style={styles.subtitle}>Curated crochet pieces, made with care.</Text>
        </View>

        <View style={styles.mainTabs}>
          <Pressable
            style={styles.mainTab}
            onPress={() => setTab('products')}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'products' }}
          >
            <Text style={[styles.mainTabText, tab === 'products' && styles.mainTabTextActive]}>
              Products
            </Text>
            {tab === 'products' ? <View style={styles.mainTabIndicator} /> : <View style={styles.mainTabIndicatorSpacer} />}
          </Pressable>
          <Pressable
            style={styles.mainTab}
            onPress={() => setTab('orders')}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'orders' }}
          >
            <Text style={[styles.mainTabText, tab === 'orders' && styles.mainTabTextActive]}>
              My Orders
            </Text>
            {tab === 'orders' ? <View style={styles.mainTabIndicator} /> : <View style={styles.mainTabIndicatorSpacer} />}
          </Pressable>
        </View>

        {tab === 'products' && (
          <>
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={18} color={colors.muted} />
              <TextInput
                style={styles.search}
                value={query}
                onChangeText={setQuery}
                placeholder="Search bags, toys, blankets..."
                placeholderTextColor={colors.muted}
                returnKeyType="search"
                onSubmitEditing={() => load()}
              />
              <View style={styles.searchDivider} />
              <Pressable
                style={styles.filterBtn}
                onPress={() => setFilterOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Filter by category"
                hitSlop={6}
              >
                <Ionicons
                  name="options-outline"
                  size={20}
                  color={filterActive ? colors.pink : colors.ink}
                />
                {filterActive ? <View style={styles.filterDot} /> : null}
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryTabs}
            >
              {tabs.map((cat) => (
                <Pressable
                  key={cat}
                  style={[styles.categoryTab, activeCategory === cat && styles.categoryTabActive]}
                  onPress={() => selectCategory(cat)}
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
            </ScrollView>
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
            key="shop-products-grid"
            data={displayedProducts}
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
              <EmptyView
                title={activeCategory === WISHLIST_FILTER ? 'Wishlist is empty' : 'No products found'}
                message={
                  activeCategory === WISHLIST_FILTER
                    ? 'Tap the heart on a product to save it here.'
                    : 'Try another category or search term.'
                }
              />
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
          key="shop-orders-list"
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

      <Modal
        visible={filterOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterOpen(false)}
      >
        <View style={styles.filterSheetRoot}>
          <Pressable style={styles.filterBackdrop} onPress={() => setFilterOpen(false)} />
          <View style={[styles.filterSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.filterHandle} />
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>Filter by category</Text>
              <Pressable onPress={() => setFilterOpen(false)} hitSlop={8}>
                <Text style={styles.filterClose}>Close</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {tabs.map((cat) => {
                const selected = activeCategory === cat;
                return (
                  <Pressable
                    key={cat}
                    style={[styles.filterOption, selected && styles.filterOptionActive]}
                    onPress={() => selectCategory(cat)}
                  >
                    <Text style={[styles.filterOptionText, selected && styles.filterOptionTextActive]}>
                      {cat}
                    </Text>
                    {selected ? (
                      <Ionicons name="checkmark" size={18} color={colors.pink} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.md,
    backgroundColor: colors.canvas,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brandRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  tagline: {
    fontFamily: fonts.decorative,
    fontSize: 26,
    lineHeight: 32,
    paddingBottom: 4,
    color: colors.ink,
    textAlign: 'right',
    flexShrink: 1,
  },
  cartBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeText: {
    fontFamily: fonts.extraBold,
    fontSize: 9,
    color: colors.white,
  },
  pageIntro: {
    gap: 4,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 36,
    lineHeight: 44,
    paddingBottom: 4,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  mainTabs: {
    flexDirection: 'row',
    gap: 22,
  },
  mainTab: {
    paddingBottom: 8,
    alignItems: 'flex-start',
  },
  mainTabText: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.muted,
  },
  mainTabTextActive: {
    color: colors.pink,
  },
  mainTabIndicator: {
    marginTop: 8,
    height: 2.5,
    alignSelf: 'stretch',
    backgroundColor: colors.pink,
    borderRadius: 2,
  },
  mainTabIndicatorSpacer: {
    marginTop: 8,
    height: 2.5,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.softBorder,
    borderRadius: 999,
    paddingLeft: 14,
    paddingRight: 6,
    minHeight: 48,
    gap: 8,
  },
  search: {
    flex: 1,
    paddingVertical: 12,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
  },
  searchDivider: {
    width: StyleSheet.hairlineWidth,
    height: 22,
    backgroundColor: colors.softBorder,
  },
  filterBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.pink,
  },
  filterSheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  filterBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(34, 26, 30, 0.4)',
  },
  filterSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingHorizontal: spacing.md,
    paddingTop: 10,
  },
  filterHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.softBorder,
    marginBottom: 12,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  filterTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 17,
    color: colors.ink,
  },
  filterClose: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.muted,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.softBorder,
  },
  filterOptionActive: {
    backgroundColor: colors.pinkSoft,
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
  },
  filterOptionText: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.ink,
  },
  filterOptionTextActive: {
    color: colors.pink,
  },
  categoryTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: spacing.md,
  },
  categoryTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.softBorder,
  },
  categoryTabActive: {
    backgroundColor: colors.pink,
    borderColor: colors.pink,
  },
  categoryTabText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
  categoryTabTextActive: {
    fontFamily: fonts.semiBold,
    color: colors.white,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    alignItems: 'stretch',
  },
  ordersList: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  ordersEmpty: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
});
