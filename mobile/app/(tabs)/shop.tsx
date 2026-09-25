import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
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
import {
  listProductCategories,
  listProducts,
  productTypeForRoom,
} from '../../src/api/products';
import { listMyOrders, type OrderResponse } from '../../src/api/orders';
import { ApiClientError } from '../../src/api/client';
import { useShoppingSession } from '../../src/auth/SessionContext';
import { useCart } from '../../src/cart/CartContext';
import { MyOrderCard } from '../../src/components/MyOrderCard';
import { BrandWordmark } from '../../src/components/BrandWordmark';
import { MyViviPageGradient } from '../../src/components/MyViviPageGradient';
import { ProductCard } from '../../src/components/ProductCard';
import { EmptyView, ErrorView, LoadingView } from '../../src/components/StateViews';
import { useTabDockClearance } from '../../src/components/PremiumTabBar';
import type { Product } from '../../src/types';
import { useI18n } from '../../src/i18n';
import { uiFonts, type UiFonts } from '../../src/i18n/uiFonts';
import { colors, radii, spacing } from '../../src/theme';
import { applyStatusBar } from '../../src/utils/statusBar';
import { useWishlist } from '../../src/wishlist/WishlistContext';
import { prefetchImages } from '../../src/components/AppImage';

type ShopTab = 'products' | 'orders';
type ShopRoom = 'handmade' | 'essentials';
const WISHLIST_FILTER = 'Wishlist';

/** Designed Crochet Essentials category collage (1536×1024). */
/** Compressed app copies of assets/crochet-essentials.png and assets/shophandmade.png. */
const ESSENTIALS_HERO = require('../../assets/shop-essentials-app.jpg');
/** Designed Handmade Collection collage (1536×1024). */
const HANDMADE_HERO = require('../../assets/shop-handmade-app.png');

function parseShopRoom(raw: string | string[] | undefined): ShopRoom | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'handmade' || value === 'essentials') return value;
  return null;
}

function categoryLabel(
  cat: string,
  t: (key: import('../../src/i18n').TranslationKey) => string,
): string {
  if (cat === 'All') return t('shop.all');
  if (cat === WISHLIST_FILTER) return t('shop.wishlist');
  return cat;
}

function toFriendlyShopError(
  err: unknown,
  t: (key: import('../../src/i18n').TranslationKey) => string,
): string {
  if (err instanceof ApiClientError) {
    const msg = err.message || '';
    if (
      err.status === 0 ||
      /network|fetch|timeout|failed to fetch|expo cli|econnrefused/i.test(msg)
    ) {
      return t('shop.loadFailedFriendly');
    }
    // Prefer customer-safe copy over raw transport text.
    if (/network|request failed|axios|exception|stack/i.test(msg)) {
      return t('shop.loadFailedFriendly');
    }
  }
  return t('shop.loadFailedFriendly');
}

function ProductGridSkeleton({ fonts }: { fonts: UiFonts }) {
  const styles = useMemo(() => createStyles(fonts), [fonts]);
  return (
    <View style={styles.skeletonGrid}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={styles.skeletonImage} />
          <View style={styles.skeletonLineWide} />
          <View style={styles.skeletonLine} />
          <View style={styles.skeletonLineShort} />
        </View>
      ))}
    </View>
  );
}

export default function ShopScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);
  const { shopTab: shopTabParam, shopRoom: shopRoomParam } = useLocalSearchParams<{
    shopTab?: string | string[];
    shopRoom?: string | string[];
  }>();
  const shopTab = Array.isArray(shopTabParam) ? shopTabParam[0] : shopTabParam;
  const { itemCount } = useCart();
  const { productIds: wishlistIds } = useWishlist();
  const { isAuthenticated } = useShoppingSession();
  const dockClearance = useTabDockClearance();
  const [tab, setTab] = useState<ShopTab>(shopTab === 'orders' ? 'orders' : 'products');
  const [room, setRoom] = useState<ShopRoom | null>(() => parseShopRoom(shopRoomParam));
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
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
    const next = parseShopRoom(shopRoomParam);
    if (next) setRoom(next);
  }, [shopRoomParam]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const productType = room ? productTypeForRoom(room) : undefined;

  const load = useCallback(
    async (isRefresh = false) => {
      if (!productType) return;
      const id = ++requestId.current;
      const showFullScreen = !hasLoadedOnce.current && !isRefresh;
      if (showFullScreen) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const [cats, data] = await Promise.all([
          listProductCategories(productType),
          listProducts(
            activeCategory === 'All' || activeCategory === WISHLIST_FILTER
              ? undefined
              : activeCategory,
            debouncedQuery || undefined,
            productType,
          ),
        ]);
        if (id !== requestId.current) return;
        setCategories(cats);
        setProducts(data);
        prefetchImages(data.map((p) => p.imageUrl));
        hasLoadedOnce.current = true;
      } catch (err) {
        if (id !== requestId.current) return;
        setError(toFriendlyShopError(err, t));
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [activeCategory, debouncedQuery, productType, t],
  );

  const loadOrders = useCallback(
    async (isRefresh = false) => {
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
      } catch {
        setOrdersError(t('shop.loadFailedFriendly'));
      } finally {
        setOrdersLoading(false);
        setOrdersRefreshing(false);
      }
    },
    [isAuthenticated, t],
  );

  useEffect(() => {
    if (tab === 'products' && room) void load();
  }, [load, room, tab]);

  useEffect(() => {
    if (tab === 'orders') void loadOrders();
  }, [loadOrders, tab]);

  const tabs = ['All', WISHLIST_FILTER, ...categories.filter((c) => c !== 'All')];
  const filterActive = activeCategory !== 'All';
  const displayedProducts =
    activeCategory === WISHLIST_FILTER
      ? products.filter((p) => wishlistIds.includes(p.id))
      : products;

  const roomHero =
    room === 'essentials'
      ? { title: t('shop.essentialsHeroTitle'), subtitle: t('shop.essentialsHeroSubtitle') }
      : room === 'handmade'
        ? { title: t('shop.handmadeHeroTitle'), subtitle: t('shop.handmadeHeroSubtitle') }
        : { title: t('shop.heroTitle'), subtitle: t('shop.heroSubtitle') };

  function selectCategory(cat: string) {
    setActiveCategory(cat);
    setFilterOpen(false);
  }

  function enterRoom(next: ShopRoom) {
    hasLoadedOnce.current = false;
    setActiveCategory('All');
    setQuery('');
    setDebouncedQuery('');
    setProducts([]);
    setCategories([]);
    setError(null);
    setRoom(next);
    setTab('products');
  }

  function exitRoom() {
    hasLoadedOnce.current = false;
    setRoom(null);
    setActiveCategory('All');
    setQuery('');
    setDebouncedQuery('');
    setProducts([]);
    setCategories([]);
    setError(null);
    setFilterOpen(false);
  }

  const showingChooser = tab === 'products' && !room;
  const emptyIsWishlist = activeCategory === WISHLIST_FILTER;
  const emptyIsSearch = Boolean(debouncedQuery) || activeCategory !== 'All';

  return (
    <MyViviPageGradient>
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={[styles.brandSide, styles.brandSideLeft]}>
            {room ? (
              <Pressable
                style={styles.backRooms}
                onPress={exitRoom}
                accessibilityRole="button"
                accessibilityLabel={t('shop.backToRooms')}
                hitSlop={6}
              >
                <Ionicons name="chevron-back" size={16} color={colors.pink} />
                <Text style={styles.backRoomsText}>{t('shop.backToRooms')}</Text>
              </Pressable>
            ) : null}
          </View>
          <BrandWordmark size="sm" />
          <View style={[styles.brandSide, styles.brandSideRight]}>
            <Pressable
              style={styles.cartBtn}
              onPress={() => router.push('/cart')}
              accessibilityRole="button"
              accessibilityLabel={
                itemCount > 0 ? t('home.cartItems', { count: itemCount }) : t('home.cart')
              }
              hitSlop={8}
            >
              <Ionicons name="bag-outline" size={22} color={colors.ink} />
              {itemCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{itemCount > 99 ? '99+' : itemCount}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.pageIntro}>
          {!showingChooser ? (
            <>
              <Text style={styles.title}>{roomHero.title}</Text>
              <Text style={styles.subtitle}>{roomHero.subtitle}</Text>
              {room === 'essentials' && tab === 'products' ? (
                <Text style={styles.deliveryNote}>{t('shop.roomEssentialsDelivery')}</Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.chooserEyebrow}>{t('shop.heroSubtitle').toUpperCase()}</Text>
              <Text style={styles.chooserTitle}>{t('shop.chooseRoomTitle')}</Text>
            </>
          )}
        </View>

        {!showingChooser ? (
          <View style={styles.mainTabs}>
            <Pressable
              style={styles.mainTab}
              onPress={() => setTab('products')}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === 'products' }}
            >
              <Text style={[styles.mainTabText, tab === 'products' && styles.mainTabTextActive]}>
                {t('shop.products')}
              </Text>
              {tab === 'products' ? (
                <View style={styles.mainTabIndicator} />
              ) : (
                <View style={styles.mainTabIndicatorSpacer} />
              )}
            </Pressable>
            <Pressable
              style={styles.mainTab}
              onPress={() => setTab('orders')}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === 'orders' }}
            >
              <Text
                style={[
                  styles.mainTabTextSecondary,
                  tab === 'orders' && styles.mainTabTextActive,
                ]}
              >
                {t('shop.myOrders')}
              </Text>
              {tab === 'orders' ? (
                <View style={styles.mainTabIndicator} />
              ) : (
                <View style={styles.mainTabIndicatorSpacer} />
              )}
            </Pressable>
          </View>
        ) : null}

        {tab === 'products' && room ? (
          <>
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={16} color={colors.muted} />
              <TextInput
                style={styles.search}
                value={query}
                onChangeText={setQuery}
                placeholder={t('shop.searchProducts')}
                placeholderTextColor={colors.muted}
                returnKeyType="search"
                onSubmitEditing={() => load()}
              />
              <Pressable
                style={styles.filterBtn}
                onPress={() => setFilterOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t('shop.filterByCategory')}
                hitSlop={6}
              >
                <Ionicons
                  name="options-outline"
                  size={18}
                  color={filterActive ? colors.pink : colors.ink}
                />
                {filterActive ? <View style={styles.filterDot} /> : null}
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryTabs}
              style={styles.categoryScroll}
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
                    {categoryLabel(cat, t)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}
      </View>

      {showingChooser ? (
        <ScrollView
          contentContainerStyle={[styles.chooser, { paddingBottom: dockClearance + 28 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.roomRow}>
            <Pressable
              style={({ pressed }) => [
                styles.roomTile,
                styles.roomTileHandmade,
                pressed && styles.roomCardPressed,
              ]}
              onPress={() => enterRoom('handmade')}
              accessibilityRole="button"
              accessibilityLabel={`${t('shop.roomHandmadeTitle')}. ${t('shop.roomHandmadeSubtitle')}`}
            >
              <Image
                source={HANDMADE_HERO}
                style={styles.roomTilePhoto}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
              <LinearGradient
                colors={['rgba(114, 36, 62, 0)', 'rgba(114, 36, 62, 0.88)']}
                style={styles.roomTileScrim}
                pointerEvents="none"
              />
              <View style={styles.roomTileBody}>
                <Text style={styles.roomTileTitle} numberOfLines={2}>
                  {t('shop.roomHandmadeTitle')}
                </Text>
                <Text style={styles.roomTileExamples} numberOfLines={2}>
                  {t('shop.roomHandmadeExamples')}
                </Text>
                <View style={styles.roomTileCta}>
                  <Text style={[styles.roomTileCtaText, styles.roomCtaHandmade]} numberOfLines={1}>
                    {t('shop.roomHandmadeCta')}
                  </Text>
                  <Ionicons name="arrow-forward" size={12} color={colors.pinkDark} />
                </View>
              </View>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.roomTile,
                styles.roomTileEssentials,
                pressed && styles.roomCardPressed,
              ]}
              onPress={() => enterRoom('essentials')}
              accessibilityRole="button"
              accessibilityLabel={`${t('shop.roomEssentialsTitle')}. ${t('shop.roomEssentialsSubtitle')}. ${t('shop.roomEssentialsDelivery')}`}
            >
              <Image
                source={ESSENTIALS_HERO}
                style={styles.roomTilePhoto}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
              <LinearGradient
                colors={['rgba(74, 46, 37, 0)', 'rgba(74, 46, 37, 0.9)']}
                style={styles.roomTileScrim}
                pointerEvents="none"
              />
              <View style={styles.roomDeliveryBadge}>
                <Ionicons name="car-outline" size={11} color={colors.success} />
                <Text style={styles.roomDeliveryBadgeText} numberOfLines={2}>
                  {t('shop.roomEssentialsDelivery')}
                </Text>
              </View>
              <View style={styles.roomTileBody}>
                <Text style={styles.roomTileTitle} numberOfLines={2}>
                  {t('shop.roomEssentialsTitle')}
                </Text>
                <Text style={styles.roomTileExamples} numberOfLines={2}>
                  {t('shop.roomEssentialsExamples')}
                </Text>
                <View style={styles.roomTileCta}>
                  <Text style={[styles.roomTileCtaText, styles.roomCtaEssentials]} numberOfLines={1}>
                    {t('shop.roomEssentialsCta')}
                  </Text>
                  <Ionicons name="arrow-forward" size={12} color="#6e5336" />
                </View>
              </View>
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [styles.quickLink, pressed && styles.roomCardPressed]}
            onPress={() => setTab('orders')}
            accessibilityRole="button"
            accessibilityLabel={t('shop.myOrders')}
          >
            <View style={styles.quickLinkIcon}>
              <Ionicons name="cube-outline" size={18} color={colors.pink} />
            </View>
            <Text style={styles.quickLinkText}>{t('shop.myOrders')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        </ScrollView>
      ) : tab === 'products' ? (
        loading && !refreshing ? (
          <View style={[styles.list, { paddingBottom: dockClearance + 16 }]}>
            <ProductGridSkeleton fonts={fonts} />
          </View>
        ) : error && products.length === 0 ? (
          <ErrorView message={error} onRetry={() => load()} actionLabel={t('common.retry')} />
        ) : (
          <FlatList
            key={`shop-products-${room}`}
            data={displayedProducts}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={[styles.list, { paddingBottom: dockClearance + 16 }]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
                tintColor={colors.pink}
              />
            }
            ListEmptyComponent={
              <EmptyView
                title={
                  emptyIsWishlist
                    ? t('shop.emptyWishlistTitle')
                    : emptyIsSearch
                      ? t('shop.noProductsTitle')
                      : t('shop.emptyRoomTitle')
                }
                message={
                  emptyIsWishlist
                    ? t('shop.wishlistEmptyHint')
                    : emptyIsSearch
                      ? t('shop.noProductsSearchHint')
                      : t('shop.emptyRoomMessage')
                }
              />
            }
            renderItem={({ item, index }) => (
              <ProductCard
                product={item}
                index={index}
                showStock={room === 'essentials'}
                compact={room === 'essentials'}
                onPress={() => router.push(`/product/${item.id}`)}
              />
            )}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={7}
            removeClippedSubviews
          />
        )
      ) : !isAuthenticated ? (
        <View style={[styles.ordersEmpty, { paddingBottom: dockClearance }]}>
          <ErrorView
            title={t('shop.signInForOrders')}
            message={t('shop.ordersSignInMessage')}
            actionLabel={t('shop.signIn')}
            onAction={() =>
              router.push({
                pathname: '/login',
                params: { returnTo: '/(tabs)/shop?shopTab=orders' },
              })
            }
          />
        </View>
      ) : ordersLoading && !ordersRefreshing ? (
        <LoadingView message={t('shop.loadingOrders')} />
      ) : ordersError && orders.length === 0 ? (
        <ErrorView message={ordersError} onRetry={() => loadOrders()} actionLabel={t('common.retry')} />
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
              <EmptyView title={t('shop.noOrdersTitle')} message={t('shop.noOrdersMessage')} />
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
              <Text style={styles.filterTitle}>{t('shop.filterByCategory')}</Text>
              <Pressable onPress={() => setFilterOpen(false)} hitSlop={8}>
                <Text style={styles.filterClose}>{t('common.close')}</Text>
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
                    <Text
                      style={[styles.filterOptionText, selected && styles.filterOptionTextActive]}
                    >
                      {categoryLabel(cat, t)}
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
    </MyViviPageGradient>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    header: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
      paddingBottom: spacing.sm,
      gap: 6,
      backgroundColor: 'transparent',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(255, 255, 255, 0.35)',
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    brandSide: {
      minWidth: 40,
      flex: 1,
    },
    brandSideLeft: {
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    brandSideRight: {
      alignItems: 'flex-end',
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
      gap: 2,
    },
    backRooms: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 1,
      paddingVertical: 6,
      marginLeft: -4,
    },
    backRoomsText: {
      fontFamily: fonts.semiBold,
      fontSize: 12,
      color: colors.pink,
    },
    title: {
      fontFamily: fonts.heading,
      fontSize: 30,
      lineHeight: 36,
      color: colors.ink,
    },
    subtitle: {
      fontFamily: fonts.regular,
      fontSize: 14,
      color: colors.muted,
      lineHeight: 20,
      marginTop: 2,
    },
    deliveryNote: {
      fontFamily: fonts.semiBold,
      fontSize: 11,
      color: colors.pink,
      marginTop: 6,
    },
    mainTabs: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 28,
      marginTop: 4,
    },
    mainTab: {
      paddingBottom: 4,
      alignItems: 'flex-start',
    },
    mainTabText: {
      fontFamily: fonts.extraBold,
      fontSize: 15,
      letterSpacing: 0.2,
      color: colors.muted,
    },
    mainTabTextSecondary: {
      fontFamily: fonts.semiBold,
      fontSize: 13,
      color: colors.muted,
    },
    mainTabTextActive: {
      color: colors.ink,
    },
    mainTabIndicator: {
      marginTop: 6,
      height: 2,
      alignSelf: 'stretch',
      backgroundColor: colors.pink,
    },
    mainTabIndicatorSpacer: {
      marginTop: 6,
      height: 2,
    },
    chooser: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      gap: 12,
    },
    chooserEyebrow: {
      fontFamily: fonts.semiBold,
      fontSize: 11,
      letterSpacing: 1.6,
      color: colors.pinkDark,
      marginBottom: 2,
    },
    chooserTitle: {
      fontFamily: fonts.heading,
      fontSize: 24,
      lineHeight: 29,
      color: colors.ink,
    },
    roomRow: {
      flexDirection: 'row',
      gap: 10,
    },
    roomTile: {
      flex: 1,
      aspectRatio: 0.52,
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.7)',
      justifyContent: 'flex-end',
    },
    roomTileHandmade: {
      backgroundColor: '#ffc7d8',
    },
    roomTileEssentials: {
      backgroundColor: '#efe2d3',
    },
    /* Bundled images default to their pixel size, so size them to the card explicitly. */
    roomTilePhoto: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
    },
    roomTileScrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '62%',
    },
    roomTileBody: {
      padding: 12,
      gap: 3,
    },
    roomTileTitle: {
      fontFamily: fonts.extraBold,
      fontSize: 16,
      lineHeight: 20,
      color: colors.white,
    },
    roomTileExamples: {
      fontFamily: fonts.regular,
      fontSize: 11,
      lineHeight: 15,
      color: 'rgba(255, 255, 255, 0.9)',
    },
    roomTileCta: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 8,
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.white,
      maxWidth: '100%',
    },
    roomTileCtaText: {
      fontFamily: fonts.extraBold,
      fontSize: 11,
      flexShrink: 1,
    },
    quickLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: 'rgba(255, 255, 255, 0.62)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.85)',
    },
    quickLinkIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: colors.pinkSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickLinkText: {
      flex: 1,
      fontFamily: fonts.semiBold,
      fontSize: 14,
      color: colors.ink,
    },
    roomCardPressed: {
      opacity: 0.94,
      transform: [{ scale: 0.985 }],
    },
    roomDeliveryBadge: {
      position: 'absolute',
      top: 10,
      left: 10,
      right: 10,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 10,
      backgroundColor: 'rgba(255, 255, 255, 0.92)',
    },
    roomDeliveryBadgeText: {
      flexShrink: 1,
      fontFamily: fonts.extraBold,
      fontSize: 10,
      lineHeight: 13,
      color: colors.success,
    },
    roomCtaHandmade: {
      color: colors.pinkDark,
    },
    roomCtaEssentials: {
      color: '#6e5336',
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.white,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingLeft: 12,
      paddingRight: 4,
      minHeight: 40,
      gap: 8,
    },
    search: {
      flex: 1,
      paddingVertical: 8,
      fontFamily: fonts.regular,
      fontSize: 14,
      color: colors.ink,
    },
    filterBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterDot: {
      position: 'absolute',
      top: 9,
      right: 9,
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.pink,
    },
    categoryScroll: {
      marginHorizontal: -spacing.md,
    },
    categoryTabs: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: spacing.md,
      paddingTop: 2,
      paddingBottom: 2,
    },
    categoryTab: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.white,
    },
    categoryTabActive: {
      backgroundColor: colors.pink,
      borderColor: colors.pink,
    },
    categoryTabText: {
      fontFamily: fonts.semiBold,
      fontSize: 11,
      letterSpacing: 0.3,
      color: colors.muted,
    },
    categoryTabTextActive: {
      color: colors.white,
    },
    list: {
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.md,
    },
    row: {
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
      alignItems: 'stretch',
      gap: spacing.sm,
    },
    skeletonGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    skeletonCard: {
      width: '48%',
      backgroundColor: 'rgba(255, 255, 255, 0.28)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.62)',
      borderRadius: 14,
      overflow: 'hidden',
      paddingBottom: 12,
    },
    skeletonImage: {
      width: '100%',
      aspectRatio: 1,
      backgroundColor: 'rgba(239, 232, 228, 0.55)',
    },
    skeletonLineWide: {
      height: 10,
      marginTop: 12,
      marginHorizontal: 10,
      backgroundColor: 'rgba(239, 232, 228, 0.7)',
    },
    skeletonLine: {
      height: 10,
      marginTop: 8,
      marginHorizontal: 10,
      width: '70%',
      backgroundColor: 'rgba(239, 232, 228, 0.7)',
    },
    skeletonLineShort: {
      height: 10,
      marginTop: 8,
      marginHorizontal: 10,
      width: '40%',
      backgroundColor: 'rgba(239, 232, 228, 0.7)',
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
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
      maxHeight: '70%',
      paddingHorizontal: spacing.md,
      paddingTop: 10,
    },
    filterHandle: {
      alignSelf: 'center',
      width: 40,
      height: 3,
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
  });
}
