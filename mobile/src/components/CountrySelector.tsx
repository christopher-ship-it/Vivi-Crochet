import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { updateMyPreferences } from '../api/me';
import { useShoppingSession } from '../auth/SessionContext';
import { useCart } from '../cart/CartContext';
import { useI18n } from '../i18n';
import { uiFonts } from '../i18n/uiFonts';
import { marketFor } from '../preferences/market';
import { SUPPORTED_COUNTRIES, type AppCountryCode } from '../preferences/onboardingFlow';
import { usePreferences } from '../preferences/PreferencesContext';
import { colors, radii } from '../theme';

/**
 * Profile row that lets the user change their country later (guests too).
 * The country decides prices and what can be bought, so a signed-in user's profile is updated
 * first (the server prices by the profile), then the choice is saved on the device.
 */
export function CountrySelector({ isLast = false }: { isLast?: boolean }) {
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const { country, market, setCountry } = usePreferences();
  const { isAuthenticated } = useShoppingSession();
  const { clearCart, itemCount } = useCart();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = SUPPORTED_COUNTRIES.find((c) => c.code === market.country) ?? SUPPORTED_COUNTRIES[0];

  async function select(code: AppCountryCode) {
    if (busy) return;
    if (code === country) {
      setExpanded(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isAuthenticated) await updateMyPreferences({ countryCode: code });
      const currencyChanges = marketFor(code).currency !== market.currency;
      await setCountry(code);
      // Cart prices are in the old currency, and shop products cannot be ordered outside India.
      if (currencyChanges && itemCount > 0) await clearCart();
      setExpanded(false);
    } catch {
      setError(t('market.changeFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.pressed, !expanded && isLast && styles.rowLast]}
        onPress={() => setExpanded((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={t('market.settingsTitle')}
      >
        <View style={styles.icon}>
          <Ionicons name="globe-outline" size={17} color={colors.pink} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { fontFamily: fonts.nunitoBold }]}>{t('market.settingsTitle')}</Text>
          <Text style={[styles.subtitle, { fontFamily: fonts.decorative }]} numberOfLines={1}>
            {expanded ? t('market.settingsHint') : `${current.flag} ${t(current.nameKey)}`}
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#b0a4a8" />
      </Pressable>

      {expanded ? (
        <View style={[styles.options, isLast && styles.rowLast]}>
          {SUPPORTED_COUNTRIES.map((c) => {
            const selected = market.country === c.code;
            return (
              <Pressable
                key={c.code}
                style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}
                onPress={() => void select(c.code)}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={t(c.nameKey)}
              >
                <Text style={styles.flag}>{c.flag}</Text>
                <Text
                  style={[styles.optionLabel, { fontFamily: fonts.semiBold }, selected && styles.optionLabelSelected]}
                  numberOfLines={2}
                >
                  {t(c.nameKey)}
                </Text>
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f6e4ea',
  },
  rowLast: { borderBottomWidth: 0 },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.pinkSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0, paddingRight: 8 },
  title: { fontSize: 14, color: colors.ink },
  subtitle: { marginTop: 1, fontSize: 11.5, lineHeight: 15, color: '#9a8f93' },
  options: {
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f6e4ea',
    gap: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    gap: 12,
  },
  optionSelected: { backgroundColor: colors.pinkSoft },
  flag: { fontSize: 20 },
  optionLabel: { flex: 1, flexShrink: 1, fontSize: 15, color: colors.ink, lineHeight: 20 },
  optionLabelSelected: { color: colors.pinkDark },
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
  radioSelected: { borderColor: colors.pink },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.pink },
  error: { paddingHorizontal: 12, paddingTop: 4, fontSize: 12, color: colors.pinkDark },
});
