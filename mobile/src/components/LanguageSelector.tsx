import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n, type AppLanguage } from '../i18n';
import { uiFonts } from '../i18n/uiFonts';
import { colors, radii, spacing } from '../theme';

const OPTIONS: { code: AppLanguage; labelKey: 'language.english' | 'language.tamil' | 'language.hindi' }[] = [
  { code: 'en', labelKey: 'language.english' },
  { code: 'ta', labelKey: 'language.tamil' },
  { code: 'hi', labelKey: 'language.hindi' },
];

type LanguageSelectorProps = {
  /**
   * `menu` — matches Profile rows (Orders, Buy Again).
   * `card` — bordered cards (settings screens).
   */
  variant?: 'menu' | 'card';
  /** When true and collapsed, omit bottom hairline (last menu item). */
  isLast?: boolean;
};

export function LanguageSelector({ variant = 'menu', isLast = false }: LanguageSelectorProps) {
  const { language, setLanguage, t } = useI18n();
  const fonts = uiFonts(language);
  const [expanded, setExpanded] = useState(false);

  const currentLabelKey =
    OPTIONS.find((opt) => opt.code === language)?.labelKey ?? 'language.english';

  function selectLanguage(code: AppLanguage) {
    setLanguage(code);
    setExpanded(false);
  }

  if (variant === 'menu') {
    return (
      <View>
        <Pressable
          style={({ pressed }) => [
            styles.menuRow,
            pressed && styles.pressed,
            !expanded && isLast && styles.menuRowLast,
          ]}
          onPress={() => setExpanded((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={t('language.title')}
        >
          <View style={styles.menuIcon}>
            <Ionicons name="language-outline" size={17} color={colors.pink} />
          </View>
          <View style={styles.menuCopy}>
            <Text style={[styles.menuTitle, { fontFamily: fonts.nunitoBold }]}>
              {t('language.title')}
            </Text>
            <Text style={[styles.menuSubtitle, { fontFamily: fonts.decorative }]} numberOfLines={1}>
              {t(currentLabelKey)}
            </Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color="#b0a4a8"
          />
        </Pressable>

        {expanded ? (
          <View style={[styles.menuOptions, isLast && styles.menuRowLast]}>
            {OPTIONS.map((opt) => {
              const selected = language === opt.code;
              return (
                <Pressable
                  key={opt.code}
                  style={({ pressed }) => [
                    styles.menuOptionRow,
                    selected && styles.menuOptionSelected,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => selectLanguage(opt.code)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t(opt.labelKey)}
                >
                  <Text
                    style={[
                      styles.menuOptionLabel,
                      { fontFamily: fonts.semiBold },
                      selected && styles.menuOptionLabelSelected,
                    ]}
                    numberOfLines={2}
                  >
                    {t(opt.labelKey)}
                  </Text>
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    );
  }

  // Card variant (profile settings)
  return (
    <View style={styles.cardWrap}>
      <Pressable
        style={({ pressed }) => [styles.cardTrigger, pressed && styles.pressed]}
        onPress={() => setExpanded((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={t('language.title')}
      >
        <View style={styles.menuCopy}>
          <Text style={[styles.cardTitle, { fontFamily: fonts.semiBold }]}>
            {t('language.title')}
          </Text>
          <Text style={[styles.cardSubtitle, { fontFamily: fonts.regular }]} numberOfLines={1}>
            {expanded ? t('language.subtitle') : t(currentLabelKey)}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-forward'}
          size={20}
          color={colors.muted}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.cardList}>
          {OPTIONS.map((opt) => {
            const selected = language === opt.code;
            return (
              <Pressable
                key={opt.code}
                style={({ pressed }) => [
                  styles.cardRow,
                  selected && styles.cardRowSelected,
                  pressed && styles.pressed,
                ]}
                onPress={() => selectLanguage(opt.code)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={t(opt.labelKey)}
              >
                <Text
                  style={[
                    styles.cardRowLabel,
                    { fontFamily: fonts.semiBold },
                    selected && styles.menuOptionLabelSelected,
                  ]}
                  numberOfLines={2}
                >
                  {t(opt.labelKey)}
                </Text>
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.72,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f6e4ea',
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.pinkSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRowLast: {
    borderBottomWidth: 0,
  },
  menuCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  menuTitle: {
    fontSize: 14,
    color: colors.ink,
  },
  menuSubtitle: {
    marginTop: 1,
    fontSize: 11.5,
    lineHeight: 15,
    color: '#9a8f93',
  },
  menuOptions: {
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f6e4ea',
    gap: 4,
  },
  menuOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    gap: 12,
  },
  menuOptionSelected: {
    backgroundColor: colors.pinkSoft,
  },
  menuOptionLabel: {
    flex: 1,
    flexShrink: 1,
    fontSize: 15,
    color: colors.ink,
    lineHeight: 20,
  },
  menuOptionLabelSelected: {
    color: colors.pinkDark,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
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
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.pink,
  },
  cardWrap: {
    gap: spacing.sm,
  },
  cardTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    gap: 12,
  },
  cardTitle: {
    fontSize: 17,
    color: colors.ink,
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  cardList: {
    gap: 8,
    marginBottom: 4,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.softBorder,
    gap: 12,
  },
  cardRowSelected: {
    borderColor: colors.pink,
    backgroundColor: colors.pinkSoft,
  },
  cardRowLabel: {
    flex: 1,
    flexShrink: 1,
    fontSize: 16,
    color: colors.ink,
    lineHeight: 22,
  },
});
