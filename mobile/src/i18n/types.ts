export type AppLanguage = 'en' | 'ta' | 'hi';

export type TranslationParams = Record<string, string | number>;

/** Nested translation leaf = string; branches = nested objects. */
export type TranslationTree = { [key: string]: string | TranslationTree };

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;

export type TranslationPaths<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends TranslationTree
      ? Join<K, TranslationPaths<T[K]>>
      : never;
}[keyof T & string];
