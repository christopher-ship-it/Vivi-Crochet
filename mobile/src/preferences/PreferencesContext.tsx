import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { setMemoryCountry } from '../api/client';
import { formatMoney, marketFor, type Market } from './market';
import { type AppCountryCode } from './onboardingFlow';
import { loadStoredCountry, saveStoredCountry } from './storage';

interface PreferencesValue {
  /** The country the user chose, or null if they have not chosen one yet. */
  country: AppCountryCode | null;
  ready: boolean;
  /** What this country can buy and which currency it pays in (missing country = India). */
  market: Market;
  /** Saves the choice on this device (signed-in users are synced to their profile by PreferenceSync). */
  setCountry: (country: AppCountryCode) => Promise<void>;
  /** Formats a price in the current market's currency. */
  formatPrice: (amount: number) => string;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [country, setCountryState] = useState<AppCountryCode | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadStoredCountry().then((stored) => {
      if (cancelled) return;
      setMemoryCountry(stored);
      setCountryState(stored);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setCountry = useCallback(async (next: AppCountryCode) => {
    // Headers first, so the very next request already prices for the new country.
    setMemoryCountry(next);
    setCountryState(next);
    await saveStoredCountry(next);
  }, []);

  const market = useMemo(() => marketFor(country), [country]);
  const formatPrice = useCallback((amount: number) => formatMoney(amount, market.currency), [market.currency]);

  const value = useMemo<PreferencesValue>(
    () => ({ country, ready, market, setCountry, formatPrice }),
    [country, ready, market, setCountry, formatPrice],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}

/** Safe outside the provider (e.g. during splash): behaves as India. */
export function usePreferencesOptional(): PreferencesValue | null {
  return useContext(PreferencesContext);
}
