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
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  listProductCategories,
  listProducts,
  productTypeForRoom,
} from '../../src/api/products';
import { listMyOrders, type OrderResponse } from '../../src/api/orders';
import { getShopSettings } from '../../src/api/shopSettings';
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
import { AppImage, prefetchImages } from '../../src/components/AppImage';
import { findBeginnerKit } from '../../src/cart/beginnerKit';
import { formatInr } from '../../src/utils/format';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ShopTab = 'products' | 'orders';
type ShopRoom = 'handmade' | 'essentials';
const WISHLIST_FILTER = 'Wishlist';
/** Chip that shows every yarn category together (T-Shirt Yarn, Rose Yarn, ...). */
const YARN_FILTER = '__yarn__';
/** Gold frame and label gradients for the arch cards. */
const GOLD_FRAME = ['#fbe6a2', '#f0b543', '#c98a1c'] as const;
const GOLD_LABEL = ['#fff3c9', '#f5cd68'] as const;
const ARCH_PHOTO_BG = '#fff6f2';
/** String-light bulbs for the "Start here" band: a bright core with a soft halo around it. */
const BULBS = [
  { core: '#fff3c4', halo: 'rgba(255, 224, 130, 0.32)' },
  { core: '#ffd1e0', halo: 'rgba(255, 170, 200, 0.32)' },
  { core: '#ffe08a', halo: 'rgba(255, 200, 90, 0.32)' },
  { core: '#ffffff', halo: 'rgba(255, 255, 255, 0.28)' },
  { core: '#ffc2d6', halo: 'rgba(255, 150, 185, 0.32)' },
  { core: '#fff3c4', halo: 'rgba(255, 224, 130, 0.32)' },
  { core: '#ffd1e0', halo: 'rgba(255, 170, 200, 0.32)' },
  { core: '#ffe08a', halo: 'rgba(255, 200, 90, 0.32)' },
  { core: '#ffffff', halo: 'rgba(255, 255, 255, 0.28)' },
  { core: '#ffc2d6', halo: 'rgba(255, 150, 185, 0.32)' },
  { core: '#fff3c4', halo: 'rgba(255, 224, 130, 0.32)' },
  { core: '#ffd1e0', halo: 'rgba(255, 170, 200, 0.32)' },
];

/** Behind the yarn photos on the yarn cards: white, because the product photos have white backgrounds. */
const YARN_PHOTO_BG = '#ffffff';
/** Last loaded Essentials list, so the landing shows the kit card at once on revisits. */
let essentialsCache: Product[] = [];
/** Last Essentials list saved on the device, so the Shop shows its cards at once on the next open. */
const ESSENTIALS_STORAGE_KEY = 'vivi_shop_essentials_v1';

/** Small icon per category chip — keyword match against free-text category names. */
function categoryChipIcon(cat: string): keyof typeof Ionicons.glyphMap {
  if (cat === 'All') return 'grid-outline';
  if (cat === YARN_FILTER) return 'color-palette-outline';
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
  if (cat === YARN_FILTER) return t('shop.yarnTitle');
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

/** Gold wire with a string of glowing bulbs, laid along the top edge of a festive band. */
function FestiveLights({ styles }: { styles: ReturnType<typeof createStyles> }) {
  return (
    <>
      <View pointerEvents="none" style={styles.lightsWire} />
      <View pointerEvents="none" style={styles.lightsRow}>
        {BULBS.map((bulb, i) => (
          <View key={i} style={[styles.bulbHalo, { backgroundColor: bulb.halo, marginTop: i % 2 ? 5 : 0 }]}>
            <View style={[styles.bulb, { backgroundColor: bulb.core }]} />
          </View>
        ))}
      </View>
    </>
  );
}

export default function ShopScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  // Two yarn cards fit inside the gradient band: page padding and band padding come off the width.
  const yarnSize = Math.floor((windowWidth - spacing.md * 2 - 24 - 12) / 2);
  // The yarn cards are a little smaller than half the band, so the next card peeks in at the right.
  const yarnCardSize = Math.round(yarnSize * 0.86);
  // A little taller than wide, so a two-line name fits without being cut.
  const yarnBox = { width: yarnCardSize, height: yarnCardSize + 26 };
  // The two arch cards (kit and materials) are smaller than the yarn cards and sit centred in their band.
  const archSize = Math.round(yarnSize * 0.86);
  const { t, language } = useI18n();
  const { market } = usePreferences();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts, language !== 'en'), [language]);
  // Two of the category names from the materials text, e.g. "Hooks · Bag rings".
  const materialsHighlights = t('shop.roomEssentialsExamples')
    .split('·')
    .map((label) => label.trim())
    .filter(Boolean)
    .slice(1, 3)
    .join(' · ');
  const {
    shopTab: shopTabParam,
    shopRoom: shopRoomParam,
    shopYarn: shopYarnParam,
    at: navStamp,
  } = useLocalSearchParams<{
    shopTab?: string | string[];
    shopRoom?: string | string[];
    /** "1" opens Essentials already filtered to yarn. */
    shopYarn?: string | string[];
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
  /** The yarn tapped on the yarn page; its first four colours show in a sheet. */
  const [yarnSheet, setYarnSheet] = useState<Product | null>(null);
  const hasLoadedOnce = useRef(false);
  const requestId = useRef(0);
  // Shop landing: the beginner kit card and the yarn highlight come from the real Essentials products.
  const [essentials, setEssentials] = useState<Product[]>(essentialsCache);
  const [essentialsLoading, setEssentialsLoading] = useState(essentialsCache.length === 0);
  // Stays on until the admin switch says otherwise; a failed call leaves Handmade visible.
  const [handmadeEnabled, setHandmadeEnabled] = useState(true);
  useFocusEffect(
    useCallback(() => {
      getShopSettings().then((s) => setHandmadeEnabled(s.handmadeEnabled)).catch(() => {});
    }, []),
  );

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

  const shopYarn = Array.isArray(shopYarnParam) ? shopYarnParam[0] : shopYarnParam;
  useEffect(() => {
    if (shopYarn === '1') enterRoom('essentials', YARN_FILTER);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopYarn, navStamp]);

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
            activeCategory === 'All' || activeCategory === YARN_FILTER ? undefined : activeCategory,
            debouncedQuery || undefined,
            productType,
          ),
        ]);
        if (id !== requestId.current) return;
        const shown =
          activeCategory === YARN_FILTER ? data.filter((p) => /yarn/i.test(p.category)) : data;
        setCategories(cats);
        setProducts(shown);
        prefetchImages(shown.map((p) => p.imageUrl));
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

  const yarnCategories = categories.filter((c) => /yarn/i.test(c));
  // A single yarn category already is the "Yarn" chip; the combined chip only helps when there are several.
  const hasYarn = room === 'essentials' && yarnCategories.length > 1;
  const tabs = [
    'All',
    ...(hasYarn ? [YARN_FILTER] : []),
    WISHLIST_FILTER,
    ...categories.filter((c) => c !== 'All'),
  ];
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

  // A last row with fewer cards than columns must keep each card in its own column slot,
  // so it is topped up with invisible spacers (otherwise the cards drift to the row's ends).
  // The yarn page (a yarn chip or View all) shows four per row; other lists keep their grids.
  const yarnView = room === 'essentials' && (activeCategory === YARN_FILTER || /yarn/i.test(activeCategory));
  const gridColumns = room === 'essentials' ? (yarnView ? 4 : 3) : 2;
  const yarnTileWidth = Math.floor((windowWidth - spacing.sm * 2 - 3 * spacing.sm) / 4);
  const gridData: (Product | { id: string; spacer: true })[] = [...displayedProducts];
  while (gridData.length % gridColumns !== 0 && gridData.length > 0) {
    gridData.push({ id: `spacer-${gridData.length}`, spacer: true });
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
    // Entered from a yarn link with one yarn category: that category's chip is the active one.
    if (activeCategory === YARN_FILTER && !hasYarn) return cat === yarnCategories[0];
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

  function enterRoom(next: ShopRoom, category = 'All') {
    hasLoadedOnce.current = false;
    setActiveCategory(category);
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

  // On a cold start, show the last saved list straight away while the fresh one loads.
  useEffect(() => {
    if (essentialsCache.length > 0) return;
    let cancelled = false;
    AsyncStorage.getItem(ESSENTIALS_STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const saved = JSON.parse(raw) as Product[];
        if (!Array.isArray(saved) || saved.length === 0) return;
        essentialsCache = saved;
        setEssentials(saved);
        setEssentialsLoading(false);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Reloaded each time the landing is shown, so a sold-out kit or a new price is picked up.
  // A failed lookup just hides the kit card and yarn highlight; the two room cards still work.
  useEffect(() => {
    if (!showingChooser || !market.canOrderProducts) return;
    let cancelled = false;
    listProducts(undefined, undefined, 'Resell')
      .then((list) => {
        if (cancelled) return;
        essentialsCache = list;
        setEssentials(list);
        void AsyncStorage.setItem(ESSENTIALS_STORAGE_KEY, JSON.stringify(list)).catch(() => undefined);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setEssentialsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showingChooser, market.canOrderProducts]);

  const kit = useMemo(() => findBeginnerKit(essentials), [essentials]);
  // One card per yarn product (any product in a category with "yarn" in its name), built from the
  // real products, so a newly added yarn shows up on the landing page by itself.
  const yarnCards = useMemo(
    () =>
      essentials
        .filter((p) => p.status !== 'Draft' && p.price > 0 && /yarn/i.test(p.category ?? ''))
        .map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          mrp: p.mrp ?? null,
          imageUrl: (p.imageUrl ?? '').trim() || null,
          colours: p.variantCount ?? p.variants?.length ?? 0,
        })),
    [essentials],
  );
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
                <Text style={styles.backRoomsText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
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
          {market.canOrderProducts && yarnCards.length > 0 ? (
            <LinearGradient
              colors={['#e8215b', '#ff6b6b', '#ffc27a']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.yarnBand}
            >
              {/* Same festive lights as the "Start here" band, in warmer colours. */}
              <View pointerEvents="none" style={styles.yarnGlowLarge} />
              <View pointerEvents="none" style={styles.yarnGlowSmall} />
              <FestiveLights styles={styles} />
              <Ionicons pointerEvents="none" name="sparkles" size={15} color="#fff4cc" style={styles.yarnSparkleA} />
              <Ionicons pointerEvents="none" name="sparkles" size={11} color="#ffffff" style={styles.yarnSparkleB} />
              <Ionicons pointerEvents="none" name="sparkles" size={13} color="#fff4cc" style={styles.yarnSparkleC} />
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionTitle}>{t('shop.shopYarn')}</Text>
                  <View style={styles.deliveryRow}>
                    <Ionicons name="car-outline" size={13} color={colors.white} />
                    <Text style={styles.deliveryText} numberOfLines={1}>
                      {t('shop.roomEssentialsDelivery')}
                    </Text>
                  </View>
                </View>
                <Pressable
                  style={styles.viewAllPill}
                  onPress={() => enterRoom('essentials', YARN_FILTER)}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text style={styles.sectionLink}>{t('common.viewAll')}</Text>
                </Pressable>
              </View>
              {/* Cards swipe sideways, so many yarns do not make the page long. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.yarnRowScroll}
                contentContainerStyle={styles.yarnRow}
              >
                {yarnCards.map((card) => {
                  const off =
                    card.mrp != null && card.mrp > card.price
                      ? Math.round(((card.mrp - card.price) / card.mrp) * 100)
                      : null;
                  return (
                    <Pressable
                      key={card.id}
                      style={({ pressed }) => [styles.yarnFrame, yarnBox, pressed && styles.roomCardPressed]}
                      onPress={() => router.push(`/product/${card.id}`)}
                      accessibilityRole="button"
                      accessibilityLabel={card.name}
                    >
                      <LinearGradient colors={GOLD_FRAME} style={[StyleSheet.absoluteFill, { borderRadius: 20 }]} />
                      <LinearGradient colors={['#ffffff', '#fff1e6']} style={styles.yarnTile}>
                      <View style={styles.yarnThumb}>
                        {card.imageUrl ? (
                          <AppImage
                            uri={card.imageUrl}
                            style={styles.kitThumbImage}
                            contentFit="contain"
                            backgroundColor={YARN_PHOTO_BG}
                            accessibilityLabel={card.name}
                          />
                        ) : (
                          <Ionicons name="color-palette-outline" size={26} color={colors.pinkDark} />
                        )}
                      </View>
                      {card.colours > 0 ? (
                        <View style={styles.yarnColoursTag}>
                          <Text style={styles.yarnColoursTagText} numberOfLines={1}>
                            {t('shop.yarnColours', { count: card.colours })}
                          </Text>
                        </View>
                      ) : null}
                      <Text style={styles.yarnText} numberOfLines={2}>
                        {card.name}
                      </Text>
                      <Text style={styles.yarnPriceLine} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                        <Text style={styles.yarnPrice}>{formatInr(card.price)}</Text>
                        {off != null ? <Text style={styles.yarnMrp}>{`  ${formatInr(card.mrp!)}`}</Text> : null}
                        {off != null ? (
                          <Text style={styles.yarnOff}>{`  ${t('productCard.percentOff', { percent: off })}`}</Text>
                        ) : null}
                      </Text>
                      </LinearGradient>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </LinearGradient>
          ) : null}

          {/* Beginner kit and materials: two arch cards with gold frames on a deep band. */}
          <LinearGradient
            colors={['#3d0724', '#7a1146', '#c2185b', '#f0507f']}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={styles.archBand}
          >
            {/* Festive lights: soft glows behind the cards, a string of bulbs on top, a few sparkles. */}
            <View pointerEvents="none" style={styles.glowLarge} />
            <View pointerEvents="none" style={styles.glowSmall} />
            <FestiveLights styles={styles} />
            <Ionicons pointerEvents="none" name="sparkles" size={16} color="#ffe9a8" style={styles.sparkleA} />
            <Ionicons pointerEvents="none" name="sparkles" size={11} color="#fff4cc" style={styles.sparkleB} />
            <Ionicons pointerEvents="none" name="sparkles" size={13} color="#ffe9a8" style={styles.sparkleC} />
            <Text style={styles.archBandTitle}>{t('shop.kitStep')}</Text>
            <View style={styles.archRow}>
              {market.canOrderProducts && kit ? (
                <Pressable
                  style={({ pressed }) => [{ width: archSize }, pressed && styles.roomCardPressed]}
                  onPress={() => router.push(`/product/${kit.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${kit.name}, ${formatInr(kit.price)}. ${t('shop.kitSubtitle')}`}
                >
                  <LinearGradient colors={GOLD_FRAME} style={[styles.archFrame, { borderTopLeftRadius: archSize / 2, borderTopRightRadius: archSize / 2 }]}>
                    <View style={[styles.archInner, { borderTopLeftRadius: archSize / 2 - 3, borderTopRightRadius: archSize / 2 - 3 }]}>
                      <View style={styles.archPhoto}>
                        {kit.imageUrl ? (
                          <AppImage
                            uri={kit.imageUrl}
                            style={styles.kitThumbImage}
                            contentFit="contain"
                            backgroundColor={ARCH_PHOTO_BG}
                            accessibilityLabel={kit.name}
                          />
                        ) : (
                          <Ionicons name="cube-outline" size={30} color={colors.pinkDark} />
                        )}
                      </View>
                      <LinearGradient colors={GOLD_LABEL} style={styles.archLabel}>
                        <Text style={styles.archLabelText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                          {kit.mrp != null && kit.mrp > kit.price
                            ? `${formatInr(kit.price)} · ${t('productCard.percentOff', {
                                percent: Math.round(((kit.mrp - kit.price) / kit.mrp) * 100),
                              })}`
                            : formatInr(kit.price)}
                        </Text>
                      </LinearGradient>
                    </View>
                  </LinearGradient>
                  <Text style={styles.archCaption} numberOfLines={1}>
                    {kit.name}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                style={({ pressed }) => [{ width: archSize }, pressed && styles.roomCardPressed]}
                onPress={() => enterRoom('essentials')}
                accessibilityRole="button"
                accessibilityLabel={`${t('shop.roomEssentialsTitle')}. ${t('shop.roomEssentialsSubtitle')}`}
              >
                <LinearGradient colors={GOLD_FRAME} style={[styles.archFrame, { borderTopLeftRadius: archSize / 2, borderTopRightRadius: archSize / 2 }]}>
                  <View style={[styles.archInner, { borderTopLeftRadius: archSize / 2 - 3, borderTopRightRadius: archSize / 2 - 3 }]}>
                    <View style={styles.archPhoto}>
                      <Image
                        source={ESSENTIALS_HERO}
                        style={styles.roomTilePhoto}
                        resizeMode="cover"
                        accessibilityIgnoresInvertColors
                      />
                    </View>
                    <LinearGradient colors={GOLD_LABEL} style={styles.archLabel}>
                      <Text style={styles.archLabelText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                        {materialsHighlights}
                      </Text>
                    </LinearGradient>
                  </View>
                </LinearGradient>
                <Text style={styles.archCaption} numberOfLines={1}>
                  {t('shop.roomEssentialsTitle')}
                </Text>
              </Pressable>
            </View>
          </LinearGradient>

          {handmadeEnabled ? (
            <Pressable
              style={({ pressed }) => [styles.handmadeCard, pressed && styles.roomCardPressed]}
              onPress={() => enterRoom('handmade')}
              accessibilityRole="button"
              accessibilityLabel={`${t('shop.roomHandmadeTitle')}. ${t('shop.roomHandmadeSubtitle')}`}
            >
              <View style={styles.handmadePhoto}>
                <Image
                  source={HANDMADE_HERO}
                  style={styles.roomTilePhoto}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
              </View>
              <LinearGradient
                colors={['#fff7fa', '#ffd6e4']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.handmadeBody}
              >
                <View style={styles.handmadeTitleRow}>
                  <Text style={styles.handmadeTitle} numberOfLines={2}>
                    {t('shop.roomHandmadeTitle')}
                  </Text>
                  <View style={styles.tileArrow}>
                    <Ionicons name="arrow-forward" size={14} color={colors.white} />
                  </View>
                </View>
                <Text style={styles.handmadeExamples} numberOfLines={2}>
                  {t('shop.roomHandmadeExamples')}
                </Text>
              </LinearGradient>
            </Pressable>
          ) : null}
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
            key={`shop-products-${room}-${gridColumns}`}
            data={gridData}
            keyExtractor={(item) => item.id}
            numColumns={gridColumns}
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
            renderItem={({ item, index }) =>
              'spacer' in item ? (
                <View style={{ flex: 1, maxWidth: gridColumns === 3 ? '33.333%' : '50%' }} />
              ) : yarnView ? (
                // Yarn page: just the photo. Tapping it opens the colours sheet.
                <Pressable
                  style={({ pressed }) => [styles.yarnPhotoTile, { width: yarnTileWidth, height: yarnTileWidth }, pressed && styles.roomCardPressed]}
                  onPress={() => setYarnSheet(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                >
                  {item.imageUrl ? (
                    <AppImage uri={item.imageUrl} style={styles.kitThumbImage} contentFit="contain" backgroundColor={colors.white} accessibilityLabel={item.name} />
                  ) : (
                    <Ionicons name="color-palette-outline" size={22} color={colors.pinkDark} />
                  )}
                </Pressable>
              ) : (
              <ProductCard
                product={item}
                index={index}
                showStock={room === 'essentials'}
                compact={room === 'essentials'}
                dense={room === 'essentials'}
                searchQuery={debouncedQuery}
                onPress={(variantId) =>
                  yarnView && !variantId ? setYarnSheet(item) : router.push(`/product/${variantId ?? item.id}`)
                }
              />
              )
            }
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
            <Text style={styles.addedBarTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {t('shop.addedToCart')}
            </Text>
            <Text style={styles.addedBarSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
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

      <Modal visible={yarnSheet !== null} transparent animationType="slide" onRequestClose={() => setYarnSheet(null)}>
        <View style={styles.yarnSheetRoot}>
          <Pressable style={styles.yarnSheetBackdrop} onPress={() => setYarnSheet(null)} />
          {yarnSheet ? (
            <View style={[styles.yarnSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <View style={styles.filterHandle} />
              <Text style={styles.yarnSheetTitle} numberOfLines={2}>{yarnSheet.name}</Text>
              {(yarnSheet.variants ?? []).slice(0, 4).map((variant) => (
                <Pressable
                  key={variant.id}
                  style={styles.yarnSheetRow}
                  onPress={() => {
                    setYarnSheet(null);
                    router.push(`/product/${variant.id}`);
                  }}
                  accessibilityRole="button"
                >
                  <View style={[styles.yarnSheetSwatch, !variant.colourHex && { backgroundColor: colors.mediaWash }]}>
                    {variant.colourHex ? (
                      <View style={[StyleSheet.absoluteFill, { backgroundColor: variant.colourHex }]} />
                    ) : variant.imageUrl ? (
                      <AppImage uri={variant.imageUrl} style={styles.kitThumbImage} contentFit="cover" />
                    ) : null}
                  </View>
                  <Text style={styles.yarnSheetName} numberOfLines={1}>{variant.colourName ?? '—'}</Text>
                  <Text style={styles.yarnSheetCode} numberOfLines={1}>{variant.productCode ?? ''}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              ))}
              <Pressable
                style={styles.yarnSheetAll}
                onPress={() => {
                  setYarnSheet(null);
                  router.push(`/product/${yarnSheet.id}`);
                }}
                accessibilityRole="button"
              >
                <Text style={styles.yarnSheetAllText}>{t('product.showAllColours', { count: yarnSheet.variantCount ?? yarnSheet.variants?.length ?? 0 })}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>

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
                      {categoryLabel(activeCategory, t)}
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
      gap: 24,
    },
    chooserEyebrow: {
      fontFamily: fonts.semiBold,
      fontSize: 11,
      letterSpacing: 1.6,
      color: colors.pinkDark,
      marginBottom: 2,
    },
    chooserTitle: {
      fontFamily: fonts.extraBold,
      // Tamil / Hindi use a bigger-looking Noto script, so they get a smaller size.
      fontSize: compact ? 18 : 20,
      lineHeight: compact ? 27 : 27,
      color: colors.ink,
    },
    kitThumbImage: {
      width: '100%',
      height: '100%',
    },
    /* Bundled images default to their pixel size, so size them to the card explicitly. */
    roomTilePhoto: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
    },
    roomCardPressed: {
      opacity: 0.94,
      transform: [{ scale: 0.985 }],
    },
    // Same soft-shadow card as the yarn tiles, so the whole page reads as one shop.
    handmadeCard: {
      flexDirection: 'row',
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.softBorder,
      backgroundColor: colors.white,
      shadowColor: '#3a1a28',
      shadowOpacity: 0.1,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    handmadePhoto: {
      width: 104,
      height: 104,
      backgroundColor: colors.pinkMist,
    },
    handmadeBody: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 4,
    },
    handmadeExamples: {
      fontFamily: fonts.semiBold,
      fontSize: 12,
      lineHeight: compact ? 19 : 16,
      color: colors.pinkDark,
    },
    handmadeTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    handmadeTitle: {
      flex: 1,
      fontFamily: fonts.extraBold,
      fontSize: compact ? 16 : 17,
      lineHeight: compact ? 25 : 22,
      color: colors.ink,
    },
    // Vivid band behind the yarn cards, so the yarn section stands out on the Shop page.
    yarnBand: {
      borderRadius: 24,
      overflow: 'hidden',
      paddingTop: 22,
      paddingBottom: 16,
      paddingHorizontal: 12,
      gap: 12,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 4,
    },
    sectionHeading: {
      flex: 1,
      gap: 2,
    },
    sectionTitle: {
      fontFamily: fonts.extraBold,
      fontSize: compact ? 20 : 22,
      lineHeight: compact ? 30 : 28,
      color: colors.white,
    },
    deliveryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    deliveryText: {
      flexShrink: 1,
      fontFamily: fonts.semiBold,
      fontSize: 12,
      lineHeight: compact ? 19 : 16,
      color: colors.white,
    },
    viewAllPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: 'rgba(255, 255, 255, 0.24)',
    },
    sectionLink: {
      fontFamily: fonts.extraBold,
      fontSize: 11,
      letterSpacing: 1,
      color: colors.white,
    },
    // The row reaches the band edges, so a third card peeks in at the right.
    yarnRowScroll: {
      marginHorizontal: -12,
      flexGrow: 0,
    },
    yarnRow: {
      paddingHorizontal: 12,
      gap: 12,
    },
    // Gold frame around each yarn card, with a warm glow, like the arch cards below.
    yarnFrame: {
      padding: 2.5,
      borderRadius: 20,
      shadowColor: '#ffd36b',
      shadowOpacity: 0.6,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    yarnTile: {
      flex: 1,
      padding: 6,
      gap: 4,
      borderRadius: 17.5,
      overflow: 'hidden',
    },
    // Soft pools of light and sparkles inside the yarn band.
    yarnGlowLarge: {
      position: 'absolute',
      width: 240,
      height: 240,
      borderRadius: 120,
      right: -70,
      bottom: -90,
      backgroundColor: 'rgba(255, 244, 200, 0.28)',
    },
    yarnGlowSmall: {
      position: 'absolute',
      width: 130,
      height: 130,
      borderRadius: 65,
      left: -40,
      top: 20,
      backgroundColor: 'rgba(255, 120, 150, 0.25)',
    },
    yarnSparkleA: {
      position: 'absolute',
      top: 64,
      right: 18,
      opacity: 0.9,
    },
    yarnSparkleB: {
      position: 'absolute',
      bottom: 60,
      right: 28,
      opacity: 0.85,
    },
    yarnSparkleC: {
      position: 'absolute',
      bottom: 22,
      right: 52,
      opacity: 0.8,
    },
    yarnThumb: {
      width: '100%',
      height: compact ? 62 : 70,
      paddingTop: 14,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: YARN_PHOTO_BG,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Corner tab, flush with the card's top-left corner.
    yarnColoursTag: {
      position: 'absolute',
      top: 0,
      left: 0,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderTopLeftRadius: 15,
      borderBottomRightRadius: 12,
      backgroundColor: colors.pink,
    },
    yarnColoursTagText: {
      fontFamily: fonts.extraBold,
      fontSize: 10,
      lineHeight: 15,
      color: colors.white,
    },
    yarnText: {
      flex: 1,
      paddingHorizontal: 4,
      fontFamily: fonts.semiBold,
      fontSize: 12,
      lineHeight: compact ? 19 : 16,
      color: colors.muted,
    },
    yarnPriceLine: {
      paddingHorizontal: 4,
    },
    yarnPrice: {
      fontFamily: fonts.extraBold,
      fontSize: 15,
      color: colors.ink,
    },
    yarnMrp: {
      fontFamily: fonts.semiBold,
      fontSize: 11,
      color: colors.muted,
      textDecorationLine: 'line-through',
    },
    yarnOff: {
      fontFamily: fonts.extraBold,
      fontSize: 10,
      color: colors.pinkDark,
    },
    // Deep band behind the two arch cards, so the gold frames stand out.
    archBand: {
      borderRadius: 24,
      overflow: 'hidden',
      paddingTop: 16,
      paddingBottom: 10,
      paddingHorizontal: 12,
      gap: 4,
      borderWidth: 1,
      borderColor: 'rgba(255, 214, 120, 0.45)',
    },
    // Soft pools of warm light behind the cards.
    glowLarge: {
      position: 'absolute',
      width: 260,
      height: 260,
      borderRadius: 130,
      right: -60,
      top: 30,
      backgroundColor: 'rgba(255, 200, 110, 0.16)',
    },
    glowSmall: {
      position: 'absolute',
      width: 150,
      height: 150,
      borderRadius: 75,
      left: -40,
      bottom: -30,
      backgroundColor: 'rgba(255, 140, 180, 0.22)',
    },
    lightsWire: {
      position: 'absolute',
      top: 5,
      left: 10,
      right: 10,
      height: 1,
      backgroundColor: 'rgba(255, 226, 150, 0.55)',
    },
    lightsRow: {
      position: 'absolute',
      top: 2,
      left: 10,
      right: 10,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    bulbHalo: {
      width: 14,
      height: 14,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bulb: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    sparkleA: {
      position: 'absolute',
      top: 34,
      right: 30,
      opacity: 0.9,
    },
    sparkleB: {
      position: 'absolute',
      top: 56,
      right: 62,
      opacity: 0.8,
    },
    sparkleC: {
      position: 'absolute',
      top: 78,
      left: 22,
      opacity: 0.7,
    },
    archBandTitle: {
      paddingHorizontal: 4,
      fontFamily: fonts.extraBold,
      fontSize: compact ? 17 : 18,
      lineHeight: compact ? 25 : 22,
      color: colors.white,
    },
    archRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 16,
    },
    // Gold frame with a rounded-arch top; the radii are set in the card from its width.
    archFrame: {
      padding: 3,
      shadowColor: '#ffd36b',
      shadowOpacity: 0.6,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
      borderBottomLeftRadius: 16,
      borderBottomRightRadius: 16,
    },
    archInner: {
      height: 114,
      overflow: 'hidden',
      borderBottomLeftRadius: 13,
      borderBottomRightRadius: 13,
      backgroundColor: ARCH_PHOTO_BG,
    },
    archPhoto: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    archLabel: {
      paddingVertical: 5,
      paddingHorizontal: 6,
      alignItems: 'center',
    },
    archLabelText: {
      fontFamily: fonts.extraBold,
      fontSize: 10,
      lineHeight: compact ? 19 : 16,
      color: colors.ink,
    },
    archCaption: {
      marginTop: 3,
      textAlign: 'center',
      fontFamily: fonts.semiBold,
      fontSize: 12,
      lineHeight: compact ? 18 : 16,
      color: colors.white,
    },
    tileArrow: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.pink,
      alignItems: 'center',
      justifyContent: 'center',
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
    yarnPhotoTile: {
      borderRadius: 14,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.white,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.softBorder,
    },
    yarnSheetRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    yarnSheetBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(34, 26, 30, 0.4)',
    },
    yarnSheet: {
      backgroundColor: colors.white,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: spacing.md,
      paddingTop: 10,
      gap: 4,
    },
    yarnSheetTitle: {
      fontFamily: fonts.extraBold,
      fontSize: 16,
      color: colors.ink,
      marginBottom: 6,
    },
    yarnSheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.softBorder,
    },
    yarnSheetSwatch: {
      width: 34,
      height: 34,
      borderRadius: 17,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    yarnSheetName: {
      flex: 1,
      fontFamily: fonts.semiBold,
      fontSize: 15,
      color: colors.ink,
    },
    yarnSheetCode: {
      fontFamily: fonts.regular,
      fontSize: 12,
      color: colors.muted,
    },
    yarnSheetAll: {
      alignItems: 'center',
      marginTop: 10,
      paddingVertical: 13,
      borderRadius: 14,
      backgroundColor: colors.pink,
    },
    yarnSheetAllText: {
      fontFamily: fonts.extraBold,
      fontSize: 14,
      color: colors.white,
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
