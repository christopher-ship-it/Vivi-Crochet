import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShoppingSession } from '../src/auth/SessionContext';
import { useI18n } from '../src/i18n';
import { uiFonts } from '../src/i18n/uiFonts';
import { colors, spacing } from '../src/theme';

export default function ProfileSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useShoppingSession();
  const { t, language } = useI18n();
  const fonts = uiFonts(language);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace({ pathname: '/login', params: { returnTo: '/profile-settings' } });
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <Stack.Screen options={{ title: t('settings.title'), headerBackTitle: t('common.back') }} />
      <ScrollView
        style={styles.root}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push('/edit-account')}
          accessibilityRole="button"
          accessibilityLabel={t('settings.myProfile')}
        >
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, { fontFamily: fonts.semiBold }]}>
              {t('settings.myProfile')}
            </Text>
            <Text style={[styles.rowSubtitle, { fontFamily: fonts.regular }]}>
              {t('settings.myProfileSub')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>

        <View style={styles.divider} />

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push('/delete-account')}
          accessibilityRole="button"
          accessibilityLabel={t('settings.deleteAccount')}
        >
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, styles.danger, { fontFamily: fonts.semiBold }]}>
              {t('settings.deleteAccount')}
            </Text>
            <Text style={[styles.rowSubtitle, { fontFamily: fonts.regular }]}>
              {t('settings.deleteAccountSub')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.cream,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    gap: 12,
  },
  rowPressed: {
    opacity: 0.72,
  },
  rowCopy: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontSize: 17,
    color: colors.ink,
    flexShrink: 1,
  },
  rowSubtitle: {
    fontSize: 13,
    color: colors.muted,
    flexShrink: 1,
    lineHeight: 18,
  },
  danger: {
    color: colors.danger,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(44, 24, 16, 0.12)',
    marginVertical: spacing.md,
  },
});
