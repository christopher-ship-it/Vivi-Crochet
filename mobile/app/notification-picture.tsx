import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppImage } from '../src/components/AppImage';
import { useI18n } from '../src/i18n';
import { uiFonts, type UiFonts } from '../src/i18n/uiFonts';
import { colors, radii, spacing } from '../src/theme';

/** Opened by tapping a picture notification: the picture full size, with a button to the page it links to. */
export default function NotificationPictureScreen() {
  const { image, title, body, screen } = useLocalSearchParams<{
    image: string;
    title?: string;
    body?: string;
    screen?: string;
  }>();
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const styles = useMemo(() => createStyles(fonts), [language]);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  function openTarget() {
    if (!screen) return;
    const target = screen === '/(tabs)/index' || screen === '/(tabs)/' ? '/(tabs)' : screen;
    router.replace(target as never);
  }

  return (
    <>
      <Stack.Screen options={{ title: '', headerShadowVisible: false }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        {image ? (
          <AppImage uri={image} style={styles.picture} contentFit="contain" accessibilityLabel={title || undefined} />
        ) : null}
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {body ? <Text style={styles.body}>{body}</Text> : null}
        {screen ? (
          <Pressable style={styles.button} onPress={openTarget} accessibilityRole="button">
            <Text style={styles.buttonText}>{t('notificationPicture.open')}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.canvas,
    },
    content: {
      paddingHorizontal: spacing.md,
      gap: spacing.md,
    },
    picture: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: radii.lg,
    },
    title: {
      fontFamily: fonts.extraBold,
      fontSize: 22,
      lineHeight: 28,
      color: colors.ink,
    },
    body: {
      fontFamily: fonts.regular,
      fontSize: 15,
      lineHeight: 22,
      color: colors.muted,
    },
    button: {
      marginTop: spacing.sm,
      paddingVertical: 14,
      borderRadius: radii.md,
      alignItems: 'center',
      backgroundColor: colors.pink,
    },
    buttonText: {
      fontFamily: fonts.extraBold,
      fontSize: 16,
      color: colors.white,
    },
  });
}
