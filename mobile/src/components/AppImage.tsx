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
 * Stable cache key for an image URL.
 *
 * Product / course photos come from private blob storage as short-lived signed links: the API
 * signs a fresh link (new `sig` / `se`) on every request, so the same photo has a different URL
 * each time. Keyed by the full URL, the on-device cache never hit and every photo was downloaded
 * again on each app open or refresh. Dropping the query string keys the cache by the blob path,
 * which is unique per uploaded image, so a photo is downloaded once and reused.
 */
export function imageCacheKey(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

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

  const cacheKey = imageCacheKey(source);

  return (
    <Image
      source={{ uri: source, cacheKey }}
      style={[{ backgroundColor }, style]}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey ?? cacheKey}
      priority={priority}
      transition={transition}
      accessibilityLabel={accessibilityLabel}
      onError={onError}
    />
  );
}

/**
 * Warm the image cache for the given URLs (stored under the same stable key AppImage reads).
 * Fire-and-forget; failures are ignored.
 */
export function prefetchImages(urls: Array<string | null | undefined>): void {
  const unique = [
    ...new Set(
      urls
        .map((u) => u?.trim())
        .filter((u): u is string => Boolean(u)),
    ),
  ].slice(0, 8);
  if (unique.length === 0) return;
  for (const url of unique) {
    void Image.loadAsync({ uri: url, cacheKey: imageCacheKey(url) }).catch(() => undefined);
  }
}
