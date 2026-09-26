import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { colors, fonts } from '../theme';
import { formatInr } from '../utils/format';
import { AppImage, prefetchImages } from './AppImage';

export type SlideItem = {
  id: string;
  imageUrl: string;
  label: string;
  price?: number;
};

type Props = {
  items: SlideItem[];
  /** Shown until real items load (or if there are none). */
  fallback: ImageSourcePropType;
  intervalMs?: number;
};

/**
 * Crossfading slideshow of real products / courses for a Home room card.
 * Falls back to a static illustration when nothing has loaded yet.
 */
export function RoomSlideshow({ items, fallback, intervalMs = 3600 }: Props) {
  const [index, setIndex] = useState(0);
  const count = items.length;

  useEffect(() => {
    prefetchImages(items.map((item) => item.imageUrl));
    setIndex(0);
  }, [items]);

  // Only tick while the Home tab is focused.
  useFocusEffect(
    useCallback(() => {
      if (count < 2) return undefined;
      const id = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
      return () => clearInterval(id);
    }, [count, intervalMs]),
  );

  if (count === 0) {
    return <Image source={fallback} style={styles.fill} resizeMode="contain" accessibilityIgnoresInvertColors />;
  }

  const item = items[index % count];
  return (
    <View style={styles.frame}>
      <AppImage
        uri={item.imageUrl}
        style={styles.fill}
        contentFit="cover"
        transition={700}
        priority="high"
        accessibilityLabel={item.label}
      />
      <View style={styles.caption} pointerEvents="none">
        <Text style={styles.captionText} numberOfLines={1}>
          {item.label}
        </Text>
        {item.price != null && item.price > 0 ? (
          <Text style={styles.captionPrice}>{formatInr(item.price)}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
  },
  frame: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.mediaWash,
  },
  caption: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
  captionText: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 10.5,
    color: colors.ink,
  },
  captionPrice: {
    fontFamily: fonts.extraBold,
    fontSize: 10.5,
    color: colors.pinkDark,
  },
});
