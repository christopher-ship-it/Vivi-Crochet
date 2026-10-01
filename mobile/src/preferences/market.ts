/**
 * What a customer can do in their country. Pure (no React / storage), so it can be unit-tested.
 * The server enforces the same rules; this only decides what the app shows.
 */
import type { AppCountryCode } from './onboardingFlow';

export interface Market {
  country: AppCountryCode;
  /** ISO currency the customer pays in. */
  currency: 'INR' | 'USD';
  /** Shop products can be ordered. */
  canOrderProducts: boolean;
  /** Live classes can be booked. */
  canBookLive: boolean;
}

export const INDIA_MARKET: Market = { country: 'IN', currency: 'INR', canOrderProducts: true, canBookLive: true };
export const US_MARKET: Market = { country: 'US', currency: 'USD', canOrderProducts: false, canBookLive: false };

/** A missing country (older installs that never chose one) behaves as India. */
export function marketFor(country: AppCountryCode | null | undefined): Market {
  return country === 'US' ? US_MARKET : INDIA_MARKET;
}

/** Formats an amount in its own currency: whole rupees, dollars with cents when needed. */
export function formatMoney(amount: number, currency: string | null | undefined): string {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** A course's price for display, or `unavailableLabel` when it is not sold in the user's country. */
export function formatCoursePrice(
  course: { price: number; currency?: string | null; availableInMarket?: boolean },
  unavailableLabel: string,
): string {
  if (course.availableInMarket === false) return unavailableLabel;
  return formatMoney(course.price, course.currency);
}
