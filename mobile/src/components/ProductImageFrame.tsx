import type { ImageContentFit, ImageProps } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, fonts } from '../theme';
import { AppImage } from './AppImage';

type ProductImageFrameProps = {
  uri?: string | null;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  accessibilityLabel?: string;
  recyclingKey?: string;
  priority?: ImageProps['priority'];
  /** Softens the product photo (e.g. sold out). */
  dimmed?: boolean;
  /** Shown when uri is missing or fails to load. */
  placeholderMark?: string;
  /** Larger mark for product-detail gallery fallback. */
  placeholderSize?: 'card' | 'hero';
  /** Inset so the product sits in a photography frame. */
  contentPadding?: number;
  children?: ReactNode;
};

/**
 * Product photography frame: solid warm ivory behind the product.
 * No texture bitmap — keeps list image decode unblocked.
 */
export function ProductImageFrame({
  uri,
  style,
  imageStyle,
  contentFit = 'contain',
  accessibilityLabel,
  recyclingKey,
  priority = 'normal',
  dimmed = false,
  placeholderMark = 'VIVI',
  placeholderSize = 'card',
  contentPadding = 10,
  children,
}: ProductImageFrameProps) {
  const source = uri?.trim() || null;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [source]);

  const showImage = Boolean(source) && !failed;

  return (
    <View style={[styles.frame, style]}>
      {showImage ? (
        <View style={[styles.imagePad, { padding: contentPadding }]}>
          <AppImage
            uri={source}
            style={[styles.image, imageStyle, dimmed && styles.dimmed]}
            contentFit={contentFit}
            backgroundColor="transparent"
            recyclingKey={recyclingKey}
            priority={priority}
            transition={0}
            accessibilityLabel={accessibilityLabel}
            onError={() => setFailed(true)}
          />
        </View>
      ) : (
        <View style={[styles.placeholder, dimmed && styles.dimmed]} accessibilityLabel={accessibilityLabel}>
          <Text
            style={[
              styles.placeholderMark,
              placeholderSize === 'hero' && styles.placeholderMarkHero,
            ]}
          >
            {placeholderMark}
          </Text>
        </View>
      )}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.cottonBase,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePad: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  dimmed: {
    opacity: 0.55,
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderMark: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    letterSpacing: 2.4,
    color: colors.muted,
    opacity: 0.4,
  },
  placeholderMarkHero: {
    fontSize: 72,
    letterSpacing: 0,
    color: colors.ink,
    opacity: 0.12,
  },
});
