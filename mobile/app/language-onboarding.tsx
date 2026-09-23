import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandWordmark } from '../src/components/BrandWordmark';
import { useI18n, type AppLanguage } from '../src/i18n';
import { loadStoredLanguage } from '../src/i18n/storage';
import { uiFonts } from '../src/i18n/uiFonts';
import { colors, radii, spacing } from '../src/theme';
import { applyStatusBar } from '../src/utils/statusBar';

const OPTIONS: {
  code: AppLanguage;
  labelKey: 'language.english' | 'language.tamil' | 'language.hindi';
}[] = [
  { code: 'en', labelKey: 'language.english' },
  { code: 'ta', labelKey: 'language.tamil' },
  { code: 'hi', labelKey: 'language.hindi' },
];

export default function LanguageOnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, language, setLanguage } = useI18n();
  const fonts = uiFonts(language);
  const [selected, setSelected] = useState<AppLanguage>('en');
  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    applyStatusBar('dark');
    let cancelled = false;
    (async () => {
      const stored = await loadStoredLanguage();
      if (!cancelled && stored) {
        router.replace('/(tabs)');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const onSelect = useCallback(
    (code: AppLanguage) => {
      setSelected(code);
      setLanguage(code);
    },
    [setLanguage],
  );

  const onContinue = useCallback(() => {
    if (continuing) return;
    setContinuing(true);
    setLanguage(selected);
    router.replace('/(tabs)');
  }, [continuing, router, selected, setLanguage]);

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
        <BrandWordmark size="md" />
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, { fontFamily: fonts.extraBold }]}>
          {t('language.onboardingTitle')}
        </Text>

        <View style={styles.list}>
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.code;
            return (
              <Pressable
                key={opt.code}
                style={({ pressed }) => [
                  styles.row,
                  isSelected && styles.rowSelected,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => onSelect(opt.code)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={t(opt.labelKey)}
              >
                <Text
                  style={[
                    styles.label,
                    { fontFamily: fonts.semiBold },
                    isSelected && styles.labelSelected,
                  ]}
                  numberOfLines={2}
                >
                  {t(opt.labelKey)}
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
          continuing && styles.ctaDisabled,
          pressed && !continuing && styles.rowPressed,
        ]}
        onPress={onContinue}
        disabled={continuing}
        accessibilityRole="button"
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
    justifyContent: 'space-between',
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
    opacity: 0.7,
  },
  ctaText: {
    color: colors.white,
    fontSize: 16,
    textAlign: 'center',
  },
});
