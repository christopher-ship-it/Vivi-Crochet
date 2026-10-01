import { useEffect, useRef } from 'react';
import { getMyProfile, updateMyPreferences } from '../api/me';
import { useShoppingSession } from '../auth/SessionContext';
import { useCart } from '../cart/CartContext';
import { cartLineKey, isProductLine } from '../cart/types';
import { useI18n } from '../i18n';
import { loadStoredLanguage } from '../i18n/storage';
import { preferencesToPull, preferencesToPush } from './onboardingFlow';
import { usePreferences } from './PreferencesContext';
import { loadStoredCountry } from './storage';

/**
 * Keeps the signed-in customer's profile in step with the language / country chosen on this
 * device. Guests are unaffected: their choices only live on the device until they sign in.
 *
 * - Values chosen on this device are sent to the profile.
 * - If this device has no value but the profile does (e.g. a new install), the profile's value is used.
 */
export function PreferenceSync() {
  const { user } = useShoppingSession();
  const { language, setLanguage } = useI18n();
  const { country, setCountry, market, ready } = usePreferences();
  const { items, removeItem } = useCart();
  const lastSent = useRef<string | null>(null);

  // Shop products cannot be ordered outside India: drop any that are left in the cart.
  useEffect(() => {
    if (!ready || market.canOrderProducts) return;
    for (const line of items.filter(isProductLine)) void removeItem(cartLineKey(line));
  }, [ready, market.canOrderProducts, items, removeItem]);

  useEffect(() => {
    if (!user) {
      lastSent.current = null;
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [storedLanguage, storedCountry, profile] = await Promise.all([
          loadStoredLanguage(),
          loadStoredCountry(),
          getMyProfile(),
        ]);
        if (cancelled) return;

        const local = { language: storedLanguage, country: storedCountry };

        const pulled = preferencesToPull(local, profile);
        if (pulled.country) await setCountry(pulled.country);
        if (pulled.language) setLanguage(pulled.language);

        const patch = preferencesToPush(local, profile);
        if (!patch) return;
        const key = JSON.stringify(patch);
        if (key === lastSent.current) return;
        lastSent.current = key;
        await updateMyPreferences(patch);
      } catch {
        // Best effort: the choice stays on the device and syncs next time.
      }
    })();

    return () => {
      cancelled = true;
    };
    // Re-run when the user signs in or changes language while signed in.
  }, [user?.id, language, country, setLanguage, setCountry]);

  return null;
}
