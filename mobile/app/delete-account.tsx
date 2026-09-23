import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../src/api/client';
import { deleteMyAccount } from '../src/api/me';
import { useShoppingSession } from '../src/auth/SessionContext';
import { useI18n, type TranslationKey } from '../src/i18n';
import { uiFonts, type UiFonts } from '../src/i18n/uiFonts';
import { colors, spacing } from '../src/theme';

type LossItemKey = 'courses' | 'live' | 'orders' | 'account';

const LOSS_ITEM_META: Array<{
  key: LossItemKey;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    key: 'courses',
    titleKey: 'deleteAccount.lossCoursesTitle',
    descriptionKey: 'deleteAccount.lossCoursesBody',
    icon: 'school-outline',
  },
  {
    key: 'live',
    titleKey: 'deleteAccount.lossLiveTitle',
    descriptionKey: 'deleteAccount.lossLiveBody',
    icon: 'videocam-outline',
  },
  {
    key: 'orders',
    titleKey: 'deleteAccount.lossOrdersTitle',
    descriptionKey: 'deleteAccount.lossOrdersBody',
    icon: 'cube-outline',
  },
  {
    key: 'account',
    titleKey: 'deleteAccount.lossAccountTitle',
    descriptionKey: 'deleteAccount.lossAccountBody',
    icon: 'person-outline',
  },
];

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.white,
    },
    flex: {
      flex: 1,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
    },
    intro: {
      fontFamily: fonts.regular,
      fontSize: 15,
      lineHeight: 22,
      color: colors.ink,
      marginBottom: spacing.xl,
    },
    list: {
      gap: 28,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
    },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: colors.pinkSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    xBadge: {
      position: 'absolute',
      right: -3,
      bottom: -3,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.pink,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.white,
    },
    itemCopy: {
      flex: 1,
      paddingTop: 2,
      gap: 4,
    },
    itemTitle: {
      fontFamily: fonts.semiBold,
      fontSize: 15,
      color: colors.ink,
    },
    itemDescription: {
      fontFamily: fonts.regular,
      fontSize: 13,
      lineHeight: 18,
      color: colors.muted,
    },
    footer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      gap: 14,
    },
    deleteBtn: {
      backgroundColor: colors.pink,
      borderRadius: 28,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
    },
    deleteBtnText: {
      fontFamily: fonts.extraBold,
      fontSize: 16,
      color: colors.white,
    },
    cancelBtn: {
      alignItems: 'center',
      paddingVertical: 6,
    },
    cancelBtnText: {
      fontFamily: fonts.semiBold,
      fontSize: 15,
      color: colors.pink,
    },
    buttonDisabled: {
      opacity: 0.65,
    },
  });
}

export default function DeleteAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, signOut } = useShoppingSession();
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace({ pathname: '/login', params: { returnTo: '/delete-account' } });
    }
  }, [isAuthenticated, router]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteMyAccount();
      await signOut();
      router.replace('/(tabs)/profile');
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : t('deleteAccount.deleteFailedBody');
      Alert.alert(t('deleteAccount.deleteFailed'), message);
    } finally {
      setDeleting(false);
    }
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{ title: t('deleteAccount.screenTitle'), headerBackTitle: t('common.back') }}
      />
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.intro}>{t('deleteAccount.intro')}</Text>

          <View style={styles.list}>
            {LOSS_ITEM_META.map((item) => (
              <View key={item.key} style={styles.item}>
                <View style={styles.iconWrap}>
                  <Ionicons name={item.icon} size={22} color={colors.ink} />
                  <View style={styles.xBadge}>
                    <Ionicons name="close" size={10} color={colors.white} />
                  </View>
                </View>
                <View style={styles.itemCopy}>
                  <Text style={styles.itemTitle}>{t(item.titleKey)}</Text>
                  <Text style={styles.itemDescription}>{t(item.descriptionKey)}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={[styles.deleteBtn, deleting && styles.buttonDisabled]}
            onPress={() => void handleDelete()}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel={t('deleteAccount.confirmDelete')}
          >
            {deleting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.deleteBtnText}>{t('deleteAccount.confirmDelete')}</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.cancelBtn}
            onPress={() => router.back()}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel={t('deleteAccount.cancelDelete')}
          >
            <Text style={styles.cancelBtnText}>{t('deleteAccount.cancelDelete')}</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}
