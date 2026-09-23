import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../src/api/client';
import { createSupportInquiry } from '../src/api/support';
import { useShoppingSession } from '../src/auth/SessionContext';
import { colors, fonts, spacing } from '../src/theme';
import { realCustomerName } from '../src/utils/validation';

type ChatBubble =
  | { id: string; kind: 'bot'; text: string }
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'time'; label: string };

const THANKS =
  'Thanks for reaching out. Our support team will contact you soon.';

function welcomeMessage(username: string): string {
  return `Welcome to Vivi, ${username}!\nPlease let us know your query, Our team is happy to help`;
}

function formatChatTime(date = new Date()): string {
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(',', ' at');
}

const MIN_QUERY_LENGTH = 1;

export default function SupportChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useShoppingSession();
  const scrollRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [bubbles, setBubbles] = useState<ChatBubble[]>(() => [
    { id: 'time-0', kind: 'time', label: formatChatTime() },
    { id: 'bot-welcome', kind: 'bot', text: '' },
  ]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace({ pathname: '/login', params: { returnTo: '/support-chat' } });
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [bubbles, sending, keyboardHeight]);

  async function handleSend() {
    const message = draft.trim();
    if (!message || sending) {
      setError(message ? null : 'Please type your query.');
      return;
    }

    setSending(true);
    setError(null);
    const userId = `user-${Date.now()}`;
    setBubbles((prev) => [...prev, { id: userId, kind: 'user', text: message }]);
    setDraft('');

    try {
      await createSupportInquiry(message);
      setBubbles((prev) => [
        ...prev,
        { id: `bot-${Date.now()}`, kind: 'bot', text: THANKS },
      ]);
    } catch (err) {
      setBubbles((prev) => prev.filter((b) => b.id !== userId));
      setDraft(message);
      setError(err instanceof ApiClientError ? err.message : 'Could not send your query. Try again.');
    } finally {
      setSending(false);
    }
  }

  const displayName = realCustomerName(user?.name) || 'there';
  const welcome = welcomeMessage(displayName);

  if (!isAuthenticated) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.pink} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <View style={styles.headerSide}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>V</Text>
            </View>
          </View>

          <Text style={styles.headerTitle} numberOfLines={1}>
            Contact us
          </Text>

          <View style={[styles.headerSide, styles.headerSideEnd]}>
            <Pressable
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                  return;
                }
                router.replace('/help-center');
              }}
              hitSlop={10}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close chat"
            >
              <Ionicons name="chevron-down" size={26} color={colors.ink} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          {bubbles.map((bubble) => {
            if (bubble.kind === 'time') {
              return (
                <Text key={bubble.id} style={styles.timeLabel}>
                  {bubble.label}
                </Text>
              );
            }
            if (bubble.kind === 'bot') {
              return (
                <View key={bubble.id} style={styles.botRow}>
                  <View style={styles.botAvatar}>
                    <Text style={styles.botAvatarText}>V</Text>
                  </View>
                  <View style={styles.botCol}>
                    <Text style={styles.botName}>vivi</Text>
                    <View style={styles.botBubble}>
                      <Text style={styles.botText}>
                        {bubble.id === 'bot-welcome' ? welcome : bubble.text}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            }
            return (
              <View key={bubble.id} style={styles.userRow}>
                <View style={styles.userBubble}>
                  <Text style={styles.userText}>{bubble.text}</Text>
                </View>
              </View>
            );
          })}
          {sending ? (
            <View style={styles.botRow}>
              <View style={styles.botAvatar}>
                <Text style={styles.botAvatarText}>V</Text>
              </View>
              <View style={styles.botCol}>
                <Text style={styles.botName}>vivi</Text>
                <View style={[styles.botBubble, styles.typingBubble]}>
                  <ActivityIndicator size="small" color={colors.pink} />
                </View>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View
          style={[
            styles.composerDock,
            {
              paddingBottom: Math.max(insets.bottom, 12) + keyboardHeight,
            },
          ]}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Type your query…"
              placeholderTextColor="#b0a4a9"
              style={styles.input}
              multiline
              maxLength={2000}
              editable={!sending}
            />
            <Pressable
              style={({ pressed }) => [
                styles.sendBtn,
                (sending || draft.trim().length < MIN_QUERY_LENGTH) && styles.sendBtnDisabled,
                pressed && styles.pressed,
              ]}
              disabled={sending || draft.trim().length < MIN_QUERY_LENGTH}
              onPress={() => void handleSend()}
              accessibilityRole="button"
              accessibilityLabel="Send query"
            >
              <Ionicons name="send" size={18} color={colors.white} />
            </Pressable>
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.white,
  },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.pinkMist,
    paddingHorizontal: spacing.md,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0d6de',
  },
  headerSide: {
    width: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerSideEnd: {
    alignItems: 'flex-end',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.nunitoBold,
    fontSize: 16,
    color: colors.white,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.nunitoBold,
    fontSize: 18,
    color: colors.ink,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thread: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: 14,
    flexGrow: 1,
  },
  timeLabel: {
    alignSelf: 'center',
    fontFamily: fonts.regular,
    fontSize: 12,
    color: '#9a8e93',
    marginBottom: 4,
  },
  botRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    maxWidth: '92%',
  },
  botAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  botAvatarText: {
    fontFamily: fonts.nunitoBold,
    fontSize: 13,
    color: colors.white,
  },
  botCol: { flex: 1, gap: 4 },
  botName: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: '#9a8e93',
    marginLeft: 4,
  },
  botBubble: {
    backgroundColor: '#f3f1f2',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  typingBubble: {
    alignSelf: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  botText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  userRow: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
  },
  userBubble: {
    backgroundColor: colors.pinkMist,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  userText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  composerDock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.softBorder,
    backgroundColor: colors.white,
    paddingTop: 10,
  },
  error: {
    marginHorizontal: spacing.md,
    marginBottom: 6,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.danger,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#e6e0e2',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.88,
  },
});
