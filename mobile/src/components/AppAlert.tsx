import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../theme';

export interface AppAlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface AppAlertState {
  title: string;
  message?: string;
  buttons: AppAlertButton[];
}

type Listener = (state: AppAlertState | null) => void;
let listener: Listener | null = null;

/**
 * Drop-in replacement for the system Alert.alert, drawn in the app's own style.
 * Shown by <AppAlertHost />, which is mounted once in the root layout.
 */
export function appAlert(title: string, message?: string, buttons?: AppAlertButton[]): void {
  listener?.({
    title,
    message,
    buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
  });
}

export function AppAlertHost() {
  const [state, setState] = useState<AppAlertState | null>(null);

  useEffect(() => {
    listener = setState;
    return () => {
      if (listener === setState) listener = null;
    };
  }, []);

  function press(button: AppAlertButton) {
    setState(null);
    button.onPress?.();
  }

  if (!state) return null;
  const stacked = state.buttons.length > 2;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setState(null)}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setState(null)} accessibilityLabel="Close" />
        <View style={styles.card} accessibilityRole="alert">
          <View style={styles.iconWrap}>
            <Ionicons name="information-circle-outline" size={26} color={colors.pink} />
          </View>
          <Text style={styles.title}>{state.title}</Text>
          {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
          <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
            {state.buttons.map((button, index) => {
              const destructive = button.style === 'destructive';
              const cancel = button.style === 'cancel';
              return (
                <Pressable
                  key={`${button.text}-${index}`}
                  style={[
                    styles.button,
                    cancel && styles.buttonCancel,
                    destructive && styles.buttonDestructive,
                    !cancel && !destructive && styles.buttonPrimary,
                  ]}
                  onPress={() => press(button)}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.buttonText,
                      cancel && styles.buttonTextCancel,
                      destructive && styles.buttonTextDestructive,
                      !cancel && !destructive && styles.buttonTextPrimary,
                    ]}
                  >
                    {button.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(34, 26, 30, 0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.softBorder,
    backgroundColor: colors.white,
    gap: 6,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pinkMist,
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    color: colors.ink,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: spacing.md,
  },
  buttonsStacked: {
    flexDirection: 'column',
  },
  button: {
    minWidth: 90,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.pink,
  },
  buttonCancel: {
    backgroundColor: colors.pinkSoft,
  },
  buttonDestructive: {
    backgroundColor: colors.danger,
  },
  buttonText: {
    fontSize: 14,
  },
  buttonTextPrimary: {
    color: colors.white,
  },
  buttonTextCancel: {
    color: colors.ink,
  },
  buttonTextDestructive: {
    color: colors.white,
  },
});
