import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLearningCustomer, useShoppingSession } from '../auth/SessionContext';
import type { LearningCustomerProfile } from '../auth/storage';
import { updateMyProfile } from '../api/me';
import { colors, fonts, radii, spacing } from '../theme';
import { isValidEmail, isValidName, isValidPhone, normalizePhone } from '../utils/validation';

interface UnlockLearnModalProps {
  visible: boolean;
  courseName: string;
  onContinue: () => void;
  onDismiss: () => void;
}

export function UnlockLearnModal({
  visible,
  courseName,
  onContinue,
  onDismiss,
}: UnlockLearnModalProps) {
  const { profile, saveProfile } = useLearningCustomer();
  const { isAuthenticated } = useShoppingSession();
  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!isValidName(fullName)) {
      setError('Enter your full name.');
      return;
    }
    if (!isValidPhone(phone)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }

    const payload: LearningCustomerProfile = {
      fullName: fullName.trim(),
      phone: normalizePhone(phone),
      email: email.trim().toLowerCase(),
    };

    setSaving(true);
    try {
      await saveProfile(payload);
      if (isAuthenticated) {
        try {
          await updateMyProfile({
            fullName: payload.fullName,
            email: payload.email,
          });
        } catch {
          // Local profile is enough for unlock; checkout will retry server sync.
        }
      }
      onContinue();
    } catch {
      setError('Could not save your details. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onDismiss}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.handle} />
              <Text style={styles.eyebrow}>LEARN & LOOP</Text>
              <Text style={styles.title}>Unlock this class</Text>
              <Text style={styles.body}>
                Tell us how to reach you for {courseName}. This saves your learning profile only —
                it is not a purchase and does not unlock full lessons yet.
              </Text>

              {error && <Text style={styles.error}>{error}</Text>}

              <Text style={styles.label}>Full name</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your name"
                placeholderTextColor={colors.muted}
                autoCapitalize="words"
              />

              <Text style={styles.label}>Phone number</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="9876543210"
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
                maxLength={10}
              />

              <Text style={styles.label}>Email address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Pressable
                style={[styles.primaryBtn, saving && styles.btnDisabled]}
                onPress={handleSubmit}
                disabled={saving}
              >
                <Text style={styles.primaryText}>
                  {saving ? 'Saving…' : 'Continue →'}
                </Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={onDismiss}>
                <Text style={styles.secondaryText}>Not now</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(24,14,18,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.cream,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    borderTopWidth: 2,
    borderTopColor: colors.border,
    maxHeight: '92%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
    opacity: 0.3,
  },
  eyebrow: {
    fontFamily: fonts.extraBold,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.pink,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 20,
    color: colors.ink,
    marginTop: 6,
    lineHeight: 26,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
    marginTop: 10,
    marginBottom: spacing.md,
  },
  label: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.muted,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.softBorder,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
  error: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.danger,
    marginBottom: 4,
  },
  primaryBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.pink,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryText: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.white,
  },
  secondaryBtn: {
    marginTop: spacing.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.muted,
  },
});
