import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { uiFonts } from '../i18n/uiFonts';
import { colors, radii } from '../theme';

interface LoadingViewProps {
  message?: string;
}

export function LoadingView({ message }: LoadingViewProps) {
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const [slow, setSlow] = useState(false);
  const displayMessage = message ?? t('common.loading');

  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 3500);
    return () => clearTimeout(id);
  }, []);

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.pink} />
      <Text style={[styles.text, { fontFamily: fonts.regular }]}>{displayMessage}</Text>
      {slow && (
        <Text style={[styles.hint, { fontFamily: fonts.regular }]}>{t('common.serverWaking')}</Text>
      )}
    </View>
  );
}

interface ErrorViewProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}

export function ErrorView({
  title,
  message,
  onRetry,
  actionLabel,
  onAction,
}: ErrorViewProps) {
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const displayTitle = title ?? t('common.somethingWentWrong');

  return (
    <View style={styles.center}>
      <Text style={[styles.title, { fontFamily: fonts.extraBold }]}>{displayTitle}</Text>
      <Text style={[styles.text, { fontFamily: fonts.regular }]}>{message}</Text>
      {onAction && actionLabel && (
        <Pressable style={styles.button} onPress={onAction}>
          <Text style={[styles.buttonText, { fontFamily: fonts.semiBold }]}>{actionLabel}</Text>
        </Pressable>
      )}
      {onRetry && (
        <Pressable
          style={[styles.button, onAction ? styles.buttonSecondary : undefined]}
          onPress={onRetry}
        >
          <Text
            style={[
              styles.buttonText,
              { fontFamily: fonts.semiBold },
              onAction ? styles.buttonTextSecondary : undefined,
            ]}
          >
            {t('common.retry')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

interface EmptyViewProps {
  title: string;
  message?: string;
}

export function EmptyView({ title, message }: EmptyViewProps) {
  const { language } = useI18n();
  const fonts = uiFonts(language);

  return (
    <View style={styles.center}>
      <Text style={[styles.title, { fontFamily: fonts.extraBold }]}>{title}</Text>
      {message && <Text style={[styles.text, { fontFamily: fonts.regular }]}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: colors.cream,
  },
  title: {
    fontSize: 20,
    color: colors.ink,
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  text: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 20,
    flexShrink: 1,
  },
  hint: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
    maxWidth: 280,
    opacity: 0.9,
  },
  button: {
    marginTop: 22,
    backgroundColor: colors.pink,
    paddingHorizontal: 20,
    paddingVertical: 13,
    minHeight: 52,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    maxWidth: 320,
  },
  buttonText: {
    color: colors.white,
    fontSize: 14,
    textAlign: 'center',
  },
  buttonSecondary: {
    backgroundColor: colors.white,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.softBorder,
  },
  buttonTextSecondary: {
    color: colors.ink,
  },
});
