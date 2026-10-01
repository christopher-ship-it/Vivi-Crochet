import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandWordmark } from '../src/components/BrandWordmark';
import { useI18n } from '../src/i18n';
import { uiFonts } from '../src/i18n/uiFonts';
import {
  canContinue,
  SUPPORTED_COUNTRIES,
  type AppCountryCode,
} from '../src/preferences/onboardingFlow';
import { detectDeviceCountry } from '../src/preferences/deviceRegion';
import { usePreferences } from '../src/preferences/PreferencesContext';
import { loadStoredCountry } from '../src/preferences/storage';
import { colors, radii, spacing } from '../src/theme';
import { applyStatusBar } from '../src/utils/statusBar';

/**
 * Step 2 of first launch: "Where are you based?". The device region only pre-selects a
 * suggestion (no GPS permission is requested); the user confirms with Continue and can change
 * it. A choice saved earlier always wins over the suggestion.
 * For now the choice is only stored (locally, and on the profile once signed in).
 */
export default function CountryOnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const { setCountry } = usePreferences();
  const [selected, setSelected] = useState<AppCountryCode | null>(null);
  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    applyStatusBar('dark');
    // Show the earlier choice if there is one, otherwise suggest the device's country.
    let cancelled = false;
    void loadStoredCountry().then((stored) => {
      if (cancelled) return;
      const initial = stored ?? detectDeviceCountry();
      if (initial) setSelected((current) => current ?? initial);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/language-onboarding');
  }, [router]);

  const onContinue = useCallback(async () => {
    if (!selected || continuing) return;
    setContinuing(true);
    await setCountry(selected);
    router.replace('/(tabs)');
  }, [continuing, router, selected, setCountry]);

  const enabled = canContinue(selected) && !continuing;

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + spacing.lg,
          paddingBottom: Math.max(insets.bottom, 16) + spacing.md,
        },
      ]}
    >
      <View style={styles.brand}>
        <Pressable
          style={styles.back}
          onPress={onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <BrandWordmark size="md" />
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, { fontFamily: fonts.extraBold }]}>
          {t('country.onboardingTitle')}
        </Text>

        <View style={styles.list}>
          {SUPPORTED_COUNTRIES.map((country) => {
            const isSelected = selected === country.code;
            return (
              <Pressable
                key={country.code}
                style={({ pressed }) => [
                  styles.row,
                  isSelected && styles.rowSelected,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => setSelected(country.code)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={t(country.nameKey)}
              >
                <Text style={styles.flag}>{country.flag}</Text>
                <Text
                  style={[
                    styles.label,
                    { fontFamily: fonts.semiBold },
                    isSelected && styles.labelSelected,
                  ]}
                  numberOfLines={2}
                >
                  {t(country.nameKey)}
                </Text>
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.cta,
          !enabled && styles.ctaDisabled,
          pressed && enabled && styles.rowPressed,
        ]}
        onPress={() => void onContinue()}
        disabled={!enabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: !enabled }}
        accessibilityLabel={t('language.continue')}
      >
        <Text style={[styles.ctaText, { fontFamily: fonts.extraBold }]}>
          {t('language.continue')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'space-between',
  },
  brand: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    position: 'absolute',
    left: -8,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.xl,
  },
  title: {
    fontSize: 26,
    lineHeight: 34,
    color: colors.ink,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  list: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.softBorder,
    gap: 12,
  },
  rowSelected: {
    borderColor: colors.pink,
    backgroundColor: colors.pinkSoft,
  },
  rowPressed: {
    opacity: 0.85,
  },
  flag: {
    fontSize: 26,
  },
  label: {
    flex: 1,
    flexShrink: 1,
    fontSize: 17,
    color: colors.ink,
    lineHeight: 24,
  },
  labelSelected: {
    color: colors.pinkDark,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioSelected: {
    borderColor: colors.pink,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.pink,
  },
  cta: {
    minHeight: 52,
    paddingHorizontal: 20,
    borderRadius: radii.md,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: {
    opacity: 0.4,
  },
  ctaText: {
    color: colors.white,
    fontSize: 16,
    textAlign: 'center',
  },
});
