import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radii, shadows, spacing } from '../theme';
import { useAppUpdate } from '../updates/useAppUpdate';

/**
 * Floating card when an EAS Update has been downloaded.
 * Hidden in Expo Go / __DEV__ (Updates.isEnabled is false).
 */
export function AppUpdateCard() {
  const insets = useSafeAreaInsets();
  const { available, applying, apply, dismiss } = useAppUpdate();

  if (!available) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, spacing.md) + 64 }]}
    >
      <View style={styles.card}>
        <View style={styles.copy}>
          <Text style={styles.title}>New update available</Text>
          <Text style={styles.body}>Refresh to get the latest VIVI improvements.</Text>
        </View>

        <Pressable
          style={[styles.updateBtn, applying && styles.updateBtnDisabled]}
          onPress={() => void apply()}
          disabled={applying}
          accessibilityRole="button"
          accessibilityLabel="Update app now"
        >
          {applying ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.updateText}>Update</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.dismissBtn}
          onPress={dismiss}
          disabled={applying}
          accessibilityRole="button"
          accessibilityLabel="Dismiss update"
        >
          <Text style={styles.dismissText}>Later</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 1000,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    ...shadows.soft,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.white,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.pinkMist,
    lineHeight: 16,
  },
  updateBtn: {
    backgroundColor: colors.pink,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateBtnDisabled: {
    opacity: 0.7,
  },
  updateText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.white,
  },
  dismissBtn: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  dismissText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.muted,
  },
});
