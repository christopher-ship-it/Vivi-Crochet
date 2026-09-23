import { Image, type ImageContentFit, type ImageProps } from 'expo-image';
import type { StyleProp, ImageStyle } from 'react-native';
import { colors } from '../theme';

type AppImageProps = {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  accessibilityLabel?: string;
  recyclingKey?: string;
  priority?: ImageProps['priority'];
  transition?: number;
  /** Override default wash — use transparent when a cotton frame sits behind. */
  backgroundColor?: string;
  onError?: () => void;
};

/**
 * Cached remote image (memory + disk). Prefer this over RN Image for product /
 * course / order thumbnails so revisits and list scrolls feel instant.
 */
export function AppImage({
  uri,
  style,
  contentFit = 'cover',
  accessibilityLabel,
  recyclingKey,
  priority = 'normal',
  transition = 100,
  backgroundColor = colors.mediaWash,
  onError,
}: AppImageProps) {
  const source = uri?.trim();
  if (!source) return null;

  return (
    <Image
      source={{ uri: source }}
      style={[{ backgroundColor }, style]}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey ?? source}
      priority={priority}
      transition={transition}
      accessibilityLabel={accessibilityLabel}
      onError={onError}
    />
  );
}

/** Prefetch remote URLs into expo-image disk cache. */
export function prefetchImages(urls: Array<string | null | undefined>): void {
  const unique = [
    ...new Set(
      urls
        .map((u) => u?.trim())
        .filter((u): u is string => Boolean(u)),
    ),
  ];
  if (unique.length === 0) return;
  void Image.prefetch(unique, 'memory-disk');
}
