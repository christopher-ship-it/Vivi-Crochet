import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { en, type EnTranslations } from './locales/en';
import { hi } from './locales/hi';
import { ta } from './locales/ta';
import { loadStoredLanguage, saveStoredLanguage } from './storage';
import type { AppLanguage, TranslationParams, TranslationPaths } from './types';

const catalogs: Record<AppLanguage, EnTranslations> = { en, ta, hi };

export type TranslationKey = TranslationPaths<EnTranslations>;

type I18nContextValue = {
  language: AppLanguage;
  ready: boolean;
  setLanguage: (language: AppLanguage) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  /** True when Tamil or Hindi — use Unicode body/heading fonts. */
  usesIndicScript: boolean;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function getByPath(tree: EnTranslations, path: string): string | undefined {
  const parts = path.split('.');
  let node: unknown = tree;
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = params[name];
    return value == null ? '' : String(value);
  });
}

export function translate(
  language: AppLanguage,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  const primary = getByPath(catalogs[language], key);
  const fallback = language === 'en' ? undefined : getByPath(en, key);
  const raw = primary ?? fallback ?? key;
  return interpolate(raw, params);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadStoredLanguage();
      if (!cancelled && stored) {
        setLanguageState(stored);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = useCallback((next: AppLanguage) => {
    setLanguageState(next);
    void saveStoredLanguage(next);
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(language, key, params),
    [language],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      ready,
      setLanguage,
      t,
      usesIndicScript: language === 'ta' || language === 'hi',
    }),
    [language, ready, setLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}

/** Safe hook for components that may render outside provider during splash. */
export function useI18nOptional(): I18nContextValue | null {
  return useContext(I18nContext);
}
