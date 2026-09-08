import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii } from '../theme';

interface LoadingViewProps {
  message?: string;
}

export function LoadingView({ message = 'Loading…' }: LoadingViewProps) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 3500);
    return () => clearTimeout(id);
  }, []);

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.pink} />
      <Text style={styles.text}>{message}</Text>
      {slow && (
        <Text style={styles.hint}>Server is waking up — this can take a few seconds.</Text>
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
  title = 'Something went wrong',
  message,
  onRetry,
  actionLabel,
  onAction,
}: ErrorViewProps) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.text}>{message}</Text>
      {onAction && actionLabel && (
        <Pressable style={styles.button} onPress={onAction}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      )}
      {onRetry && (
        <Pressable
          style={[styles.button, onAction ? styles.buttonSecondary : undefined]}
          onPress={onRetry}
        >
          <Text style={[styles.buttonText, onAction ? styles.buttonTextSecondary : undefined]}>
            Try again
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
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.text}>{message}</Text>}
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
    fontFamily: fonts.extraBold,
    fontSize: 20,
    color: colors.ink,
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  text: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 20,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
    maxWidth: 260,
    opacity: 0.9,
  },
  button: {
    marginTop: 22,
    backgroundColor: colors.pink,
    paddingHorizontal: 26,
    paddingVertical: 13,
    borderRadius: radii.md,
  },
  buttonText: {
    fontFamily: fonts.semiBold,
    color: colors.white,
    fontSize: 14,
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
