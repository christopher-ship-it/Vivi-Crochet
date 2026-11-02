import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { submitAppFeedback } from '../api/appFeedback';
import { colors } from '../theme';

/** Customers must stay in the app this long (counted in the foreground) before we ask. */
const SHOW_AFTER_MS = 30_000;
/** Ask at most once every 30 days per install. */
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const LAST_PROMPT_KEY = 'vivi_feedback_last_prompt_v1';
const MIN_MESSAGE_LENGTH = 2;
const MIN_PHONE_DIGITS = 7;

/** The phone number the server accepts: 7 to 20 characters of digits, spaces or dashes, optionally with a leading +. */
function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= MIN_PHONE_DIGITS && /^\+?[0-9 -]{7,20}$/.test(value.trim());
}

/**
 * Counts time the app is open and in the foreground. After 30 seconds, asks "Couldn't find something?"
 * and collects what the customer was looking for plus a phone number so the team can reply.
 * Background time does not count, and the sheet is never shown more than once every 30 days.
 */
export function FeedbackPrompt() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [thanks, setThanks] = useState(false);
  const activeMs = useRef(0);
  const activeSince = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let cancelled = false;

    function clearTimer() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    }

    function pause() {
      if (activeSince.current != null) {
        activeMs.current += Date.now() - activeSince.current;
        activeSince.current = null;
      }
      clearTimer();
    }

    async function resume() {
      if (done.current || activeSince.current != null) return;
      activeSince.current = Date.now();
      const remaining = SHOW_AFTER_MS - activeMs.current;
      clearTimer();
      timer.current = setTimeout(async () => {
        if (cancelled || done.current) return;
        try {
          const last = Number(await AsyncStorage.getItem(LAST_PROMPT_KEY));
          if (last && Date.now() - last < COOLDOWN_MS) {
            done.current = true;
            return;
          }
          await AsyncStorage.setItem(LAST_PROMPT_KEY, String(Date.now()));
        } catch {
          // Storage is unavailable: still show the prompt once this session.
        }
        done.current = true;
        setVisible(true);
      }, Math.max(0, remaining));
    }

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void resume();
      else pause();
    });
    void resume();

    return () => {
      cancelled = true;
      pause();
      sub.remove();
    };
  }, []);

  function close() {
    setVisible(false);
    setMessage('');
    setPhone('');
    setThanks(false);
  }

  const canSend =
    message.trim().length >= MIN_MESSAGE_LENGTH && isValidPhone(phone) && !sending;

  async function send() {
    if (!canSend) return;
    setSending(true);
    const totalSeconds = Math.round(
      (activeMs.current + (activeSince.current != null ? Date.now() - activeSince.current : 0)) / 1000,
    );
    try {
      await submitAppFeedback({
        message: message.trim(),
        phone: phone.trim(),
        platform: Platform.OS,
        secondsInApp: totalSeconds,
      });
      setThanks(true);
      setTimeout(close, 1400);
    } catch {
      // A failed send must never block the customer: just close.
      close();
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
        <View style={styles.card}>
          {thanks ? (
            <>
              <View style={styles.checkWrap}>
                <Ionicons name="heart" size={26} color={colors.pink} />
              </View>
              <Text style={styles.title}>Thank you</Text>
              <Text style={styles.body}>We'll call or message you on that number.</Text>
            </>
          ) : (
            <>
              <Text style={styles.eyebrow}>Can't find something?</Text>
              <Text style={styles.title}>What were you looking for?</Text>
              <TextInput
                style={styles.input}
                value={message}
                onChangeText={setMessage}
                placeholder="For example: hook sizes, cotton yarn, a course"
                placeholderTextColor={colors.muted}
                multiline
                maxLength={1000}
                autoFocus
              />
              <Text style={styles.label}>Your phone number</Text>
              <TextInput
                style={styles.phoneInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="We'll reply on this number"
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
                maxLength={20}
              />
              <Pressable
                style={[styles.primary, !canSend && styles.disabled]}
                onPress={() => void send()}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSend }}
              >
                <Text style={styles.primaryText}>{sending ? 'Sending…' : 'Send'}</Text>
              </Pressable>
              <Pressable onPress={close} hitSlop={8} accessibilityRole="button">
                <Text style={styles.later}>Not now</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(34, 26, 30, 0.45)',
  },
  card: {
    borderRadius: 22,
    padding: 22,
    gap: 12,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.softBorder,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 1,
    color: colors.pinkDark,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 19,
    color: colors.ink,
  },
  body: {
    fontSize: 14,
    color: colors.muted,
  },
  label: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  input: {
    minHeight: 84,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.softBorder,
    padding: 12,
    textAlignVertical: 'top',
    color: colors.ink,
  },
  phoneInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.softBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
  },
  primary: {
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: colors.pink,
  },
  disabled: {
    opacity: 0.45,
  },
  primaryText: {
    fontSize: 15,
    color: colors.white,
  },
  later: {
    textAlign: 'center',
    fontSize: 14,
    color: colors.muted,
    paddingVertical: 4,
  },
  checkWrap: {
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pinkMist,
  },
});
