import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../theme';

type BackButtonProps = {
  onPress?: () => void;
  /** Used when there is no navigation history. */
  fallbackHref?: Href;
  style?: StyleProp<ViewStyle>;
  size?: number;
  iconSize?: number;
  accessibilityLabel?: string;
};

/**
 * Circular back control — white arrow on brand pink (app colour).
 * Always navigates somewhere: history → fallback → Home tab (never a no-op that exits the app).
 */
export function BackButton({
  onPress,
  fallbackHref,
  style,
  size = 36,
  iconSize = 18,
  accessibilityLabel = 'Go back',
}: BackButtonProps) {
  const router = useRouter();

  return (
    <Pressable
      style={[
        styles.btn,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
      onPress={() => {
        if (onPress) {
          onPress();
          return;
        }
        if (router.canGoBack()) {
          router.back();
          return;
        }
        router.replace(fallbackHref ?? '/(tabs)');
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name="arrow-back" size={iconSize} color={colors.white} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pink,
  },
});
