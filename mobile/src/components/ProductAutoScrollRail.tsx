import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  FlatList,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { Product } from '../types';
import { spacing } from '../theme';
import { ProductCard, PRODUCT_CARD_GAP, RAIL_CARD_WIDTH } from './ProductCard';

const CARD_GAP = PRODUCT_CARD_GAP;
const ITEM_STRIDE = RAIL_CARD_WIDTH + CARD_GAP;
const SCROLL_SPEED = 0.45;
const RESUME_DELAY_MS = 2500;
const MIN_PRODUCTS_TO_SCROLL = 2;

interface ProductAutoScrollRailProps {
  products: Product[];
  onProductPress: (productId: string) => void;
  isActive?: boolean;
}

export function ProductAutoScrollRail({
  products,
  onProductPress,
  isActive = true,
}: ProductAutoScrollRailProps) {
  const listRef = useRef<FlatList<Product>>(null);
  const offsetRef = useRef(0);
  const pausedRef = useRef(false);
  const loopLengthRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canAutoScroll = products.length >= MIN_PRODUCTS_TO_SCROLL;
  const loopedProducts = useMemo(
    () => (canAutoScroll ? [...products, ...products] : products),
    [canAutoScroll, products],
  );

  loopLengthRef.current = canAutoScroll ? products.length * ITEM_STRIDE : 0;

  const stopAutoScroll = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startAutoScroll = useCallback(() => {
    if (!canAutoScroll || pausedRef.current) return;
    stopAutoScroll();

    const tick = () => {
      if (pausedRef.current) return;

      const loopLength = loopLengthRef.current;
      if (loopLength <= 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      let next = offsetRef.current + SCROLL_SPEED;
      if (next >= loopLength) {
        next -= loopLength;
      }

      offsetRef.current = next;
      listRef.current?.scrollToOffset({ offset: next, animated: false });
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [canAutoScroll, stopAutoScroll]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    stopAutoScroll();
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, [stopAutoScroll]);

  const scheduleResume = useCallback(() => {
    if (!canAutoScroll) return;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      pausedRef.current = false;
      startAutoScroll();
    }, RESUME_DELAY_MS);
  }, [canAutoScroll, startAutoScroll]);

  useEffect(() => {
    if (!isActive) {
      pause();
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
      return;
    }

    pausedRef.current = false;
    startAutoScroll();

    return () => {
      pause();
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
    };
  }, [isActive, pause, startAutoScroll]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    let x = event.nativeEvent.contentOffset.x;
    const loopLength = loopLengthRef.current;
    if (loopLength > 0 && x >= loopLength) {
      x -= loopLength;
      offsetRef.current = x;
      listRef.current?.scrollToOffset({ offset: x, animated: false });
      return;
    }
    offsetRef.current = x;
  }, []);

  const onScrollBeginDrag = useCallback(() => {
    pause();
  }, [pause]);

  const onScrollEndDrag = useCallback(() => {
    scheduleResume();
  }, [scheduleResume]);

  const onMomentumScrollEnd = useCallback(() => {
    scheduleResume();
  }, [scheduleResume]);

  const onLayout = useCallback(
    (_event: LayoutChangeEvent) => {
      if (canAutoScroll && !pausedRef.current && rafRef.current == null) {
        startAutoScroll();
      }
    },
    [canAutoScroll, startAutoScroll],
  );

  return (
    <FlatList
      ref={listRef}
      data={loopedProducts}
      keyExtractor={(item, index) => `${item.id}-${index}`}
      horizontal
      showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
      style={styles.list}
      contentContainerStyle={styles.content}
      onLayout={onLayout}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollEndDrag={onScrollEndDrag}
      onMomentumScrollEnd={onMomentumScrollEnd}
      ItemSeparatorComponent={() => <View style={styles.gap} />}
      renderItem={({ item, index }) => (
        <ProductCard
          product={item}
          index={index % products.length}
          variant="rail"
          showStock
          onPress={() => onProductPress(item.id)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    paddingTop: 2,
  },
  gap: {
    width: CARD_GAP,
  },
});
