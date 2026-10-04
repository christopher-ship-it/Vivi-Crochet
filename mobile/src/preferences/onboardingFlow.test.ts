import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  canContinue,
  isSupportedCountry,
  isSupportedLanguage,
  preferencesToPull,
  preferencesToPush,
  routeAfterCountry,
  routeAfterLanguage,
  routeAfterSplash,
  suggestCountry,
  SUPPORTED_COUNTRIES,
  SUPPORTED_LANGUAGE_CODES,
} from './onboardingFlow.ts';

describe('first launch routing', () => {
  test('new user sees Language first', () => {
    assert.equal(routeAfterSplash(null, null), '/language-onboarding');
  });

  test('first-time user lands on the Offers tab after choosing a country, once', () => {
    assert.equal(routeAfterCountry(false), '/(tabs)/offers');
    assert.equal(routeAfterCountry(true), '/(tabs)');
  });

  test('Country screen follows Language', () => {
    assert.equal(routeAfterLanguage(null), '/country-onboarding');
  });

  test('existing user with both saved goes straight into the app', () => {
    assert.equal(routeAfterSplash('en', 'IN'), '/(tabs)');
    assert.equal(routeAfterSplash('ta', 'US'), '/(tabs)');
  });

  test('existing user missing country is asked for country only', () => {
    assert.equal(routeAfterSplash('en', null), '/country-onboarding');
  });

  test('existing user missing language is asked for language only', () => {
    assert.equal(routeAfterSplash(null, 'IN'), '/language-onboarding');
    // ...and after choosing it, the saved country means no second question.
    assert.equal(routeAfterLanguage('IN'), '/(tabs)');
  });

  test('reopening after completion does not show the screens again', () => {
    assert.equal(routeAfterSplash('hi', 'US'), '/(tabs)');
  });
});

describe('Continue button', () => {
  test('is disabled until something is selected', () => {
    assert.equal(canContinue(null), false);
    assert.equal(canContinue(undefined), false);
    assert.equal(canContinue(''), false);
  });

  test('is enabled once a language or country is selected', () => {
    for (const code of SUPPORTED_LANGUAGE_CODES) assert.equal(canContinue(code), true);
    for (const country of SUPPORTED_COUNTRIES) assert.equal(canContinue(country.code), true);
  });
});

describe('supported values', () => {
  test('languages are English, Tamil and Hindi', () => {
    assert.deepEqual([...SUPPORTED_LANGUAGE_CODES], ['en', 'ta', 'hi']);
    for (const code of ['en', 'ta', 'hi']) assert.equal(isSupportedLanguage(code), true);
  });

  test('India saves as IN and United States saves as US', () => {
    assert.deepEqual(
      SUPPORTED_COUNTRIES.map((c) => c.code),
      ['IN', 'US'],
    );
    assert.equal(SUPPORTED_COUNTRIES[0].nameKey, 'country.india');
    assert.equal(SUPPORTED_COUNTRIES[1].nameKey, 'country.unitedStates');
  });

  test('country names and other text are never accepted as values', () => {
    for (const bad of ['India', 'USA', 'United States', 'in', 'us', 'GB', '', null, undefined]) {
      assert.equal(isSupportedCountry(bad), false);
    }
    for (const bad of ['english', 'EN', 'fr', '', null]) {
      assert.equal(isSupportedLanguage(bad), false);
    }
  });

  test('language and country are independent choices', () => {
    const pairs = [
      ['en', 'IN'],
      ['en', 'US'],
      ['ta', 'IN'],
      ['hi', 'US'],
    ] as const;
    for (const [language, country] of pairs) {
      assert.equal(isSupportedLanguage(language), true);
      assert.equal(isSupportedCountry(country), true);
    }
  });
});

describe('syncing to the profile after sign-in', () => {
  test('guest choices are pushed to a profile that has none', () => {
    assert.deepEqual(
      preferencesToPush({ language: 'en', country: 'US' }, { languageCode: null, countryCode: null }),
      { languageCode: 'en', countryCode: 'US' },
    );
  });

  test('only the changed field is sent', () => {
    assert.deepEqual(
      preferencesToPush({ language: 'en', country: 'US' }, { languageCode: 'en', countryCode: 'IN' }),
      { countryCode: 'US' },
    );
  });

  test('nothing is sent when the profile already matches or the device has no choice', () => {
    assert.equal(
      preferencesToPush({ language: 'ta', country: 'IN' }, { languageCode: 'ta', countryCode: 'IN' }),
      null,
    );
    assert.equal(preferencesToPush({ language: null, country: null }, { languageCode: 'ta', countryCode: 'IN' }), null);
  });

  test('a new install picks up the saved profile choices', () => {
    assert.deepEqual(
      preferencesToPull({ language: null, country: null }, { languageCode: 'hi', countryCode: 'US' }),
      { language: 'hi', country: 'US' },
    );
    // A choice already made on this device is not overwritten.
    assert.deepEqual(
      preferencesToPull({ language: 'en', country: null }, { languageCode: 'hi', countryCode: 'US' }),
      { country: 'US' },
    );
  });

  test('unsupported profile values are ignored', () => {
    assert.deepEqual(
      preferencesToPull({ language: null, country: null }, { languageCode: 'fr', countryCode: 'India' }),
      {},
    );
  });
});

describe('suggesting a country from the device', () => {
  test('an India time zone suggests India, even on an en-US phone', () => {
    assert.equal(suggestCountry({ timeZone: 'Asia/Kolkata', locale: 'en-US' }), 'IN');
    assert.equal(suggestCountry({ timeZone: 'Asia/Calcutta', locale: 'en-US' }), 'IN');
  });

  test('a US locale outside India suggests the United States', () => {
    assert.equal(suggestCountry({ timeZone: 'America/New_York', locale: 'en-US' }), 'US');
  });

  test('an Indian locale suggests India', () => {
    assert.equal(suggestCountry({ timeZone: 'UTC', locale: 'ta-IN' }), 'IN');
    assert.equal(suggestCountry({ locale: 'hi_IN' }), 'IN');
  });

  test('unsupported or missing regions suggest nothing', () => {
    assert.equal(suggestCountry({ timeZone: 'Europe/London', locale: 'en-GB' }), null);
    assert.equal(suggestCountry({ locale: 'en' }), null);
    assert.equal(suggestCountry({}), null);
  });
});
