import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Platform,
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
const ESSENTIALS_HERO = require('../../assets/crochet-essentials.png');
/** Designed Handmade Collection collage (1536×1024). */
const HANDMADE_HERO = require('../../assets/shophandmade.png');

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
              <Text style={styles.chooserEyebrow}>{t('shop.title').toUpperCase()}</Text>
              <Text style={styles.chooserTagline}>{t('shop.heroSubtitle')}</Text>
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
          {(() => {
            const handmadeBody = (
              <>
                <View style={[styles.roomImageWrap, styles.handmadeImageWrap]}>
                  <Image
                    source={HANDMADE_HERO}
                    style={styles.roomImage}
                    resizeMode="cover"
                    accessibilityLabel={t('shop.roomHandmadeTitle')}
                  />
                </View>
                <View style={styles.roomBody}>
                  <Text style={styles.roomTitle}>{t('shop.roomHandmadeTitle')}</Text>
                  <Text style={styles.roomSubtitle}>{t('shop.roomHandmadeSubtitle')}</Text>
                  <Text style={styles.roomExamples}>{t('shop.roomHandmadeExamples')}</Text>
                  <Text style={[styles.roomCta, styles.roomCtaHandmade]}>
                    {t('shop.roomHandmadeCta').toUpperCase()} →
                  </Text>
                </View>
              </>
            );
            const essentialsBody = (
              <>
                <View style={[styles.roomImageWrap, styles.essentialsImageWrap]}>
                  <Image
                    source={ESSENTIALS_HERO}
                    style={styles.roomImage}
                    resizeMode="cover"
                    accessibilityLabel={t('shop.roomEssentialsTitle')}
                  />
                </View>
                <View style={styles.roomBody}>
                  <Text style={styles.roomTitle}>{t('shop.roomEssentialsTitle')}</Text>
                  <Text style={styles.roomSubtitle}>{t('shop.roomEssentialsSubtitle')}</Text>
                  <Text style={styles.roomExamples}>{t('shop.roomEssentialsExamples')}</Text>
                  <View style={styles.roomDeliveryBadge}>
                    <Text style={styles.roomDeliveryBadgeText}>
                      {t('shop.roomEssentialsDelivery')}
                    </Text>
                  </View>
                  <Text style={[styles.roomCta, styles.roomCtaEssentials]}>
                    {t('shop.roomEssentialsCta').toUpperCase()} →
                  </Text>
                </View>
              </>
            );
            return (
              <>
                <Pressable
                  style={({ pressed }) => [
                    styles.roomCardShell,
                    styles.roomCardShellHandmade,
                    pressed && styles.roomCardPressed,
                  ]}
                  onPress={() => enterRoom('handmade')}
                  accessibilityRole="button"
                  accessibilityLabel={t('shop.roomHandmadeTitle')}
                >
                  {Platform.OS === 'ios' ? (
                    <BlurView intensity={34} tint="light" style={styles.roomCard}>
                      {handmadeBody}
                    </BlurView>
                  ) : (
                    <View style={[styles.roomCard, styles.roomCardAndroidHandmade]}>
                      {handmadeBody}
                    </View>
                  )}
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.roomCardShell,
                    styles.roomCardShellEssentials,
                    pressed && styles.roomCardPressed,
                  ]}
                  onPress={() => enterRoom('essentials')}
                  accessibilityRole="button"
                  accessibilityLabel={t('shop.roomEssentialsTitle')}
                >
                  {Platform.OS === 'ios' ? (
                    <BlurView intensity={34} tint="light" style={styles.roomCard}>
                      {essentialsBody}
                    </BlurView>
                  ) : (
                    <View style={[styles.roomCard, styles.roomCardAndroidEssentials]}>
                      {essentialsBody}
                    </View>
                  )}
                </Pressable>
              </>
            );
          })()}
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
      paddingTop: spacing.sm,
      gap: spacing.md,
    },
    chooserEyebrow: {
      fontFamily: fonts.semiBold,
      fontSize: 11,
      letterSpacing: 2,
      color: colors.pink,
      marginBottom: 2,
    },
    chooserTagline: {
      fontFamily: fonts.heading,
      fontSize: 26,
      lineHeight: 30,
      color: colors.ink,
    },
    chooserTitle: {
      fontFamily: fonts.regular,
      fontSize: 14,
      lineHeight: 19,
      color: colors.muted,
      marginTop: 2,
    },
    roomCardShell: {
      borderRadius: radii.lg,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.62)',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.14,
      shadowRadius: 18,
      elevation: 4,
    },
    roomCardShellHandmade: {
      shadowColor: colors.pink,
    },
    roomCardShellEssentials: {
      shadowColor: '#8a6a45',
    },
    roomCard: {
      backgroundColor: 'rgba(255, 255, 255, 0.28)',
      overflow: 'hidden',
    },
    roomCardAndroidHandmade: {
      backgroundColor: 'rgba(255, 236, 242, 0.88)',
    },
    roomCardAndroidEssentials: {
      backgroundColor: 'rgba(255, 246, 236, 0.88)',
    },
    roomCardPressed: {
      opacity: 0.94,
      transform: [{ scale: 0.985 }],
    },
    roomImageWrap: {
      width: '100%',
      aspectRatio: 3,
      backgroundColor: 'rgba(239, 232, 228, 0.55)',
    },
    handmadeImageWrap: {
      aspectRatio: 2.85,
      backgroundColor: 'rgba(247, 208, 221, 0.55)',
    },
    essentialsImageWrap: {
      aspectRatio: 2.85,
      backgroundColor: 'rgba(229, 216, 200, 0.55)',
    },
    roomImage: {
      width: '100%',
      height: '100%',
    },
    roomBody: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 12,
      gap: 2,
    },
    roomTitle: {
      fontFamily: fonts.extraBold,
      fontSize: 14,
      letterSpacing: 0.2,
      color: colors.ink,
    },
    roomSubtitle: {
      fontFamily: fonts.regular,
      fontSize: 11,
      lineHeight: 15,
      color: colors.muted,
    },
    roomExamples: {
      fontFamily: fonts.regular,
      fontSize: 10,
      lineHeight: 13,
      color: colors.muted,
    },
    roomDeliveryBadge: {
      alignSelf: 'flex-start',
      marginTop: 5,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 7,
      backgroundColor: 'rgba(240, 197, 106, 0.92)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.55)',
    },
    roomDeliveryBadgeText: {
      fontFamily: fonts.extraBold,
      fontSize: 10,
      letterSpacing: 0.2,
      color: '#3d2a0a',
    },
    roomCta: {
      fontFamily: fonts.extraBold,
      fontSize: 10,
      letterSpacing: 1,
      marginTop: 6,
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
