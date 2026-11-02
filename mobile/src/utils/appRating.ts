import AsyncStorage from '@react-native-async-storage/async-storage';

/** Once per install: the store decides whether the prompt actually appears, so we only ask at a happy moment. */
const PROMPTED_KEY = 'vivi_store_review_prompted_v1';

/**
 * Asks the App Store / Play Store for an in-app rating after a customer's first paid order.
 * The OS shows its own rating sheet and may ignore the request (for example, it is rate-limited).
 * Fails silently: a rating prompt must never break checkout.
 */
export async function requestAppRatingAfterPurchase(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(PROMPTED_KEY)) return;
    // Loaded here, not at import: a build without the native module must not crash the app on start.
    const StoreReview = require('expo-store-review') as typeof import('expo-store-review');
    if (!(await StoreReview.isAvailableAsync())) return;
    await AsyncStorage.setItem(PROMPTED_KEY, '1');
    await StoreReview.requestReview();
  } catch {
    // Not available on this device or build; nothing to show the customer.
  }
}
