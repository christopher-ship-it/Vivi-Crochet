import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { uiFonts, type UiFonts } from '../i18n/uiFonts';
import { colors, radii, spacing } from '../theme';

export interface AppDialogContent {
  title: string;
  message: string;
}

/**
 * In-app popup that replaces the system Alert. It is an overlay (not a Modal), so it can sit
 * inside another sheet's Modal; render it as the last child of the screen or sheet root.
 */
export function AppDialog({ title, message, onClose }: AppDialogContent & { onClose: () => void }) {
  const { t, language } = useI18n();
  const styles = useMemo(() => createStyles(uiFonts(language)), [language]);
  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} />
      <View style={styles.card} accessibilityRole="alert">
        <View style={styles.iconWrap}>
          <Ionicons name="alert-circle-outline" size={30} color={colors.pink} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <Pressable style={styles.button} onPress={onClose} accessibilityRole="button">
          <Text style={styles.buttonText}>{t('common.ok')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(fonts: UiFonts) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFill,
      zIndex: 50,
      elevation: 50,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      backgroundColor: 'rgba(24,14,18,0.5)',
    },
    card: {
      width: '100%',
      maxWidth: 360,
      alignItems: 'center',
      padding: spacing.lg,
      borderRadius: radii.lg,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.white,
    },
    iconWrap: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.pinkMist,
      marginBottom: spacing.sm,
    },
    title: {
      fontFamily: fonts.extraBold,
      fontSize: 18,
      lineHeight: 26,
      color: colors.ink,
      textAlign: 'center',
    },
    message: {
      fontFamily: fonts.regular,
      fontSize: 14,
      lineHeight: 21,
      color: colors.muted,
      textAlign: 'center',
      marginTop: 6,
    },
    button: {
      alignSelf: 'stretch',
      marginTop: spacing.lg,
      paddingVertical: 14,
      borderRadius: radii.md,
      alignItems: 'center',
      backgroundColor: colors.pink,
    },
    buttonText: {
      fontFamily: fonts.extraBold,
      fontSize: 14,
      color: colors.white,
    },
  });
}
