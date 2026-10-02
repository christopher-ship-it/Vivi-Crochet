import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
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
import { isOutOfStock } from '../../src/cart/stock';
import { MyOrderCard } from '../../src/components/MyOrderCard';
import { BrandWordmark } from '../../src/components/BrandWordmark';
import { MyViviPageGradient } from '../../src/components/MyViviPageGradient';
import { ProductCard } from '../../src/components/ProductCard';
import { EmptyView, ErrorView, LoadingView } from '../../src/components/StateViews';
import { useTabDockClearance } from '../../src/components/PremiumTabBar';
import { MarketNotice } from '../../src/components/MarketNotice';
import { usePreferences } from '../../src/preferences/PreferencesContext';
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

/** Small icon per category chip — keyword match against free-text category names. */
function categoryChipIcon(cat: string): keyof typeof Ionicons.glyphMap {
  if (cat === 'All') return 'grid-outline';
  if (cat === WISHLIST_FILTER) return 'heart-outline';
  const key = cat.trim().toLowerCase();
  if (key.includes('yarn')) return 'color-palette-outline';
  if (key.includes('hook')) return 'construct-outline';
  if (key.includes('ring')) return 'ellipse-outline';
  if (key.includes('button')) return 'radio-button-on-outline';
  if (key.includes('rose') || key.includes('flower')) return 'flower-outline';
  if (key.includes('t-shirt') || key.includes('tshirt') || key.includes('shirt')) return 'shirt-outline';
  if (key.includes('bag')) return 'bag-handle-outline';
  if (key.includes('toy') || key.includes('doll')) return 'happy-outline';
  if (key.includes('home') || key.includes('decor')) return 'home-outline';
  return 'pricetag-outline';
}

/** The API sends UTC timestamps without a "Z"; treat them as UTC. */
function parseUtc(value: string): number {
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasZone ? value : `${value}Z`).getTime();
}

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
  const { market } = usePreferences();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts, language !== 'en'), [language]);
  const {
    shopTab: shopTabParam,
    shopRoom: shopRoomParam,
    at: navStamp,
  } = useLocalSearchParams<{
    shopTab?: string | string[];
    shopRoom?: string | string[];
    /** Changes on every deep link so the same shopTab value still re-applies. */
    at?: string | string[];
  }>();
  const shopTab = Array.isArray(shopTabParam) ? shopTabParam[0] : shopTabParam;
  const { itemCount, justAdded, dismissJustAdded, peekItems, replaceItems } = useCart();
  const [failedOrder, setFailedOrder] = useState<OrderResponse | null>(null);
  const [dismissedFailedId, setDismissedFailedId] = useState<string | null>(null);
  const { productIds: wishlistIds } = useWishlist();
  const { isAuthenticated } = useShoppingSession();
  const dockClearance = useTabDockClearance();
  const [tab, setTab] = useState<ShopTab>(shopTab === 'orders' ? 'orders' : 'products');
  const [room, setRoom] = useState<ShopRoom | null>(() => parseShopRoom(shopRoomParam));
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');
  // Wishlist is a switch of its own, so it can be combined with a category.
  const [wishlistOnly, setWishlistOnly] = useState(false);
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
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [availability, setAvailability] = useState<'all' | 'in' | 'out'>('all');
  const [priceLowToHigh, setPriceLowToHigh] = useState(false);
  const hasLoadedOnce = useRef(false);
  const requestId = useRef(0);

  useFocusEffect(
    useCallback(() => {
      applyStatusBar('dark');
    }, []),
  );

  // Phone Back / back gesture inside a product list returns to the Shop main page
  // (the room chooser), same as the on-screen "Back to rooms" button — not Home.
  const inRoom = tab === 'products' && room !== null;
  useFocusEffect(
    useCallback(() => {
      if (!inRoom) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (filterOpen) {
          setFilterOpen(false);
          return true;
        }
        exitRoom();
        return true;
      });
      return () => sub.remove();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inRoom, filterOpen]),
  );

  useEffect(() => {
    if (shopTab === 'orders' || shopTab === 'products') {
      setTab(shopTab);
    }
  }, [shopTab, navStamp]);

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
            activeCategory === 'All' ? undefined : activeCategory,
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
        // Unpaid attempts aren't real orders for the customer; admin keeps them under Payments.
        const list = await listMyOrders();
        setOrders(list.filter((o) => o.status !== 'PaymentFailed' && o.status !== 'PendingPayment'));
        // Offer a retry only when the customer's newest attempt failed in the last 24h.
        const newest = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        const fresh = newest && Date.now() - parseUtc(newest.createdAt) < 24 * 3600_000;
        setFailedOrder(newest && newest.status === 'PaymentFailed' && fresh ? newest : null);
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
  const filterActive =
    activeCategory !== 'All' || wishlistOnly || availability !== 'all' || priceLowToHigh;
  let displayedProducts = wishlistOnly
    ? products.filter((p) => wishlistIds.includes(p.id))
    : products;
  if (availability !== 'all') {
    displayedProducts = displayedProducts.filter(
      (p) => isOutOfStock(p.availableStock ?? 0) === (availability === 'out'),
    );
  }
  if (priceLowToHigh) {
    displayedProducts = [...displayedProducts].sort((a, b) => a.price - b.price);
  }

  const roomHero =
    room === 'essentials'
      ? { title: t('shop.essentialsHeroTitle'), subtitle: t('shop.essentialsHeroSubtitle') }
      : room === 'handmade'
        ? { title: t('shop.handmadeHeroTitle'), subtitle: t('shop.handmadeHeroSubtitle') }
        : { title: t('shop.heroTitle'), subtitle: t('shop.heroSubtitle') };

  function isTabActive(cat: string): boolean {
    if (cat === WISHLIST_FILTER) return wishlistOnly;
    if (cat === 'All') return activeCategory === 'All' && !wishlistOnly;
    return activeCategory === cat;
  }

  function selectCategory(cat: string) {
    if (cat === WISHLIST_FILTER) {
      // Switch it on or off and leave the list open, so a category can be picked next.
      setWishlistOnly((on) => !on);
      return;
    }
    setActiveCategory(cat);
    if (cat === 'All') setWishlistOnly(false);
    setFilterOpen(false);
  }

  function enterRoom(next: ShopRoom) {
    hasLoadedOnce.current = false;
    setActiveCategory('All');
    setWishlistOnly(false);
    setAvailability('all');
    setPriceLowToHigh(false);
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
    setWishlistOnly(false);
    setAvailability('all');
    setPriceLowToHigh(false);
    setQuery('');
    setDebouncedQuery('');
    setProducts([]);
    setCategories([]);
    setError(null);
    setFilterOpen(false);
  }

  const showRetry = failedOrder !== null && failedOrder.id !== dismissedFailedId;

  async function retryFailedOrder() {
    if (!failedOrder) return;
    const current = peekItems();
    const merged = [...current];
    for (const item of failedOrder.items) {
      const isCourse = item.itemType === 'Course' || item.itemType === 'CourseBundle';
      const key = isCourse ? item.courseId : item.productId;
      if (!key) continue;
      const exists = merged.some((l) =>
        isCourse ? l.courseId === key : l.productId === key,
      );
      if (exists) continue;
      merged.push({
        itemType: item.itemType,
        productId: isCourse ? undefined : (item.productId ?? undefined),
        courseId: isCourse ? (item.courseId ?? undefined) : undefined,
        quantity: isCourse ? 1 : item.quantity,
        name: item.itemNameSnapshot,
        price: item.unitPrice,
      });
    }
    try {
      await replaceItems(merged);
    } catch {
      // Cart screen surfaces storage errors; still take the customer there.
    }
    setDismissedFailedId(failedOrder.id);
    router.push('/cart');
  }

  const showAddedBar = justAdded && itemCount > 0 && tab === 'products' && room !== null;
  const showingChooser = tab === 'products' && !room;
  // Inside a room the title/subtitle scroll away with the list, so products get the screen.
  const introInList = tab === 'products' && room !== null;
  const emptyIsWishlist = wishlistOnly && activeCategory === 'All';
  const emptyIsSearch =
    Boolean(debouncedQuery) || activeCategory !== 'All' || availability !== 'all';

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
                <Text style={styles.backRoomsText} numberOfLines={1}>
                  {t('shop.backToRooms')}
                </Text>
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

        {!introInList ? (
          <View style={styles.pageIntro}>
            {!showingChooser ? (
              <>
                <Text style={styles.title}>{roomHero.title}</Text>
                <Text style={styles.subtitle}>{roomHero.subtitle}</Text>
              </>
            ) : (
              <>
                <Text style={styles.chooserEyebrow}>{t('shop.heroSubtitle').toUpperCase()}</Text>
                <Text style={styles.chooserTitle}>{t('shop.chooseRoomTitle')}</Text>
              </>
            )}
          </View>
        ) : null}

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
                onPress={() => {
                  setCategoriesOpen(false);
                  setFilterOpen(true);
                }}
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
              {tabs.map((cat) => {
                const active = isTabActive(cat);
                return (
                  <Pressable
                    key={cat}
                    style={[styles.categoryTab, active && styles.categoryTabActive]}
                    onPress={() => selectCategory(cat)}
                  >
                    <Ionicons
                      name={categoryChipIcon(cat)}
                      size={14}
                      color={active ? colors.white : colors.pink}
                    />
                    <Text
                      style={[
                        styles.categoryTabText,
                        active && styles.categoryTabTextActive,
                      ]}
                    >
                      {categoryLabel(cat, t)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}
      </View>

      {!market.canOrderProducts && tab === 'products' ? (
        <MarketNotice text={t('market.productsIndiaOnly')} />
      ) : null}

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
                colors={['rgba(114, 36, 62, 0)', 'rgba(114, 36, 62, 0.55)', 'rgba(90, 24, 46, 0.94)']}
                locations={[0, 0.4, 1]}
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
                colors={['rgba(74, 46, 37, 0)', 'rgba(74, 46, 37, 0.55)', 'rgba(52, 32, 24, 0.94)']}
                locations={[0, 0.4, 1]}
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
            numColumns={room === 'essentials' ? 3 : 2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: dockClearance + 16 + (showAddedBar ? 64 : 0) },
            ]}
            ListHeaderComponent={
              <View style={styles.listIntro}>
                <Text style={styles.title}>{roomHero.title}</Text>
                <Text style={styles.subtitle}>{roomHero.subtitle}</Text>
                {room === 'essentials' ? (
                  <Text style={styles.deliveryNote}>{t('shop.roomEssentialsDelivery')}</Text>
                ) : null}
              </View>
            }
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
                dense={room === 'essentials'}
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
          ListHeaderComponent={
            showRetry ? (
              <View style={styles.retryStrip}>
                <Ionicons name="alert-circle-outline" size={20} color="#c0392b" />
                <View style={styles.addedBarCopy}>
                  <Text style={styles.retryTitle}>{t('shop.paymentNotCompleted')}</Text>
                  <Text style={styles.retrySub} numberOfLines={2}>
                    {t('shop.paymentNotCompletedHint')}
                  </Text>
                </View>
                <Pressable
                  style={styles.retryCta}
                  onPress={() => void retryFailedOrder()}
                  accessibilityRole="button"
                >
                  <Text style={styles.retryCtaText}>{t('shop.tryAgain')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setDismissedFailedId(failedOrder!.id)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.close')}
                >
                  <Ionicons name="close" size={18} color={colors.muted} />
                </Pressable>
              </View>
            ) : null
          }
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

      {showAddedBar ? (
        <View style={[styles.addedBar, { bottom: dockClearance + 4 }]} accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle" size={22} color={colors.white} />
          <View style={styles.addedBarCopy}>
            <Text style={styles.addedBarTitle} numberOfLines={1}>
              {t('shop.addedToCart')}
            </Text>
            <Text style={styles.addedBarSub} numberOfLines={1}>
              {t('shop.addedToCartCount', { count: itemCount })}
            </Text>
          </View>
          <Pressable
            style={styles.addedBarCta}
            onPress={() => {
              dismissJustAdded();
              router.push('/cart');
            }}
            accessibilityRole="button"
          >
            <Text style={styles.addedBarCtaText}>{t('shop.viewCartShort')}</Text>
          </Pressable>
          <Pressable
            onPress={dismissJustAdded}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <Ionicons name="close" size={18} color={colors.white} />
          </Pressable>
        </View>
      ) : null}

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
              <Text style={styles.filterTitle}>{t('shop.filterAndSort')}</Text>
              <Pressable onPress={() => setFilterOpen(false)} hitSlop={8}>
                <Text style={styles.filterClose}>{t('common.close')}</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Pressable
                style={[styles.filterOption, wishlistOnly && styles.filterOptionActive]}
                onPress={() => setWishlistOnly((on) => !on)}
              >
                <Text style={[styles.filterOptionText, wishlistOnly && styles.filterOptionTextActive]}>
                  {t('shop.wishlist')}
                </Text>
                {wishlistOnly ? <Ionicons name="checkmark" size={18} color={colors.pink} /> : null}
              </Pressable>
              <Pressable
                style={styles.filterOption}
                onPress={() => setCategoriesOpen((open) => !open)}
                accessibilityRole="button"
                accessibilityState={{ expanded: categoriesOpen }}
              >
                <Text style={styles.filterOptionText}>{t('shop.filterByCategory')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {activeCategory !== 'All' ? (
                    <Text style={[styles.filterOptionText, styles.filterOptionTextActive]}>
                      {activeCategory}
                    </Text>
                  ) : null}
                  <Ionicons
                    name={categoriesOpen ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.ink}
                  />
                </View>
              </Pressable>
              {categoriesOpen
                ? ['All', ...categories.filter((c) => c !== 'All')].map((cat) => {
                    const selected = activeCategory === cat;
                    return (
                      <Pressable
                        key={cat}
                        style={[
                          styles.filterOption,
                          { paddingLeft: 24 },
                          selected && styles.filterOptionActive,
                        ]}
                        onPress={() => {
                          setActiveCategory(cat);
                          setFilterOpen(false);
                        }}
                      >
                        <Text
                          style={[styles.filterOptionText, selected && styles.filterOptionTextActive]}
                        >
                          {categoryLabel(cat, t)}
                        </Text>
                        {selected ? <Ionicons name="checkmark" size={18} color={colors.pink} /> : null}
                      </Pressable>
                    );
                  })
                : null}
              <Text style={styles.filterSectionTitle}>{t('shop.availability')}</Text>
              {(
                [
                  ['in', t('shop.inStock')],
                  ['out', t('shop.outOfStock')],
                ] as const
              ).map(([key, label]) => {
                const selected = availability === key;
                return (
                  <Pressable
                    key={key}
                    style={[styles.filterOption, selected && styles.filterOptionActive]}
                    onPress={() => setAvailability(selected ? 'all' : key)}
                  >
                    <Text
                      style={[styles.filterOptionText, selected && styles.filterOptionTextActive]}
                    >
                      {label}
                    </Text>
                    {selected ? <Ionicons name="checkmark" size={18} color={colors.pink} /> : null}
                  </Pressable>
                );
              })}
              <Text style={styles.filterSectionTitle}>{t('shop.sortBy')}</Text>
              <Pressable
                style={[styles.filterOption, priceLowToHigh && styles.filterOptionActive]}
                onPress={() => setPriceLowToHigh((v) => !v)}
              >
                <Text
                  style={[styles.filterOptionText, priceLowToHigh && styles.filterOptionTextActive]}
                >
                  {t('shop.priceLowToHigh')}
                </Text>
                {priceLowToHigh ? (
                  <Ionicons name="checkmark" size={18} color={colors.pink} />
                ) : null}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
    </MyViviPageGradient>
  );
}

function createStyles(fonts: UiFonts, compact = false) {
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
      // The Latin script font is small for its size; Tamil / Hindi bold sans needs less.
      fontSize: compact ? 22 : 30,
      lineHeight: compact ? 32 : 36,
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
      // Tamil / Hindi headings use a bold sans, which reads much larger than the English script.
      fontSize: compact ? 18 : 24,
      lineHeight: compact ? 27 : 29,
      color: colors.ink,
    },
    roomRow: {
      gap: 12,
    },
    /* Wide banner tiles, stacked: Handmade on top, Essentials below. */
    roomTile: {
      width: '100%',
      aspectRatio: 1.6,
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
      height: '78%',
    },
    roomTileBody: {
      padding: 12,
      gap: 3,
    },
    roomTileTitle: {
      fontFamily: fonts.extraBold,
      fontSize: compact ? 17 : 20,
      lineHeight: compact ? 25 : 24,
      color: colors.white,
      textShadowColor: 'rgba(0, 0, 0, 0.45)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    roomTileExamples: {
      fontFamily: fonts.semiBold,
      fontSize: compact ? 12 : 13,
      lineHeight: compact ? 18 : 17,
      color: colors.white,
      textShadowColor: 'rgba(0, 0, 0, 0.45)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
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
    roomCardPressed: {
      opacity: 0.94,
      transform: [{ scale: 0.985 }],
    },
    roomDeliveryBadge: {
      position: 'absolute',
      top: 10,
      left: 10,
      maxWidth: '70%',
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
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: radii.pill,
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
      paddingTop: spacing.sm,
    },
    listIntro: {
      paddingHorizontal: spacing.sm,
      paddingBottom: spacing.sm,
      gap: 2,
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
    addedBar: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: colors.pinkDark,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 6,
    },
    retryStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: 12,
      backgroundColor: '#fdecec',
      borderWidth: 1,
      borderColor: '#f3c9c9',
    },
    retryTitle: {
      fontFamily: fonts.extraBold,
      fontSize: 13,
      color: '#c0392b',
    },
    retrySub: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.ink,
    },
    retryCta: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: radii.pill,
      backgroundColor: colors.pink,
    },
    retryCtaText: {
      fontFamily: fonts.extraBold,
      fontSize: 12,
      color: colors.white,
    },
    addedBarCopy: {
      flex: 1,
    },
    addedBarTitle: {
      fontFamily: fonts.extraBold,
      fontSize: 13,
      color: colors.white,
    },
    addedBarSub: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: 'rgba(255, 255, 255, 0.85)',
    },
    addedBarCta: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: radii.pill,
      backgroundColor: colors.white,
    },
    addedBarCtaText: {
      fontFamily: fonts.extraBold,
      fontSize: 12,
      color: colors.pinkDark,
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
    filterSectionTitle: {
      fontFamily: fonts.extraBold,
      fontSize: 13,
      color: colors.muted,
      textTransform: 'uppercase',
      marginTop: spacing.md,
      marginBottom: 2,
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
