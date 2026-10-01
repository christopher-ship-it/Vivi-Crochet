import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { formatCoursePrice, formatMoney, INDIA_MARKET, marketFor, US_MARKET } from './market.ts';

describe('market rules', () => {
  test('India can order products and book live classes, in rupees', () => {
    assert.deepEqual(marketFor('IN'), INDIA_MARKET);
    assert.equal(INDIA_MARKET.currency, 'INR');
    assert.equal(INDIA_MARKET.canOrderProducts, true);
    assert.equal(INDIA_MARKET.canBookLive, true);
  });

  test('the United States can only buy courses, in dollars', () => {
    assert.deepEqual(marketFor('US'), US_MARKET);
    assert.equal(US_MARKET.currency, 'USD');
    assert.equal(US_MARKET.canOrderProducts, false);
    assert.equal(US_MARKET.canBookLive, false);
  });

  test('a missing country behaves as India (older installs)', () => {
    assert.deepEqual(marketFor(null), INDIA_MARKET);
    assert.deepEqual(marketFor(undefined), INDIA_MARKET);
  });
});

describe('money formatting', () => {
  test('rupees are whole numbers', () => {
    assert.equal(formatMoney(999, 'INR').replace(/\s/g, ''), '₹999');
    assert.equal(formatMoney(999, undefined).replace(/\s/g, ''), '₹999');
  });

  test('dollars keep cents when needed', () => {
    assert.equal(formatMoney(19.99, 'USD'), '$19.99');
    assert.equal(formatMoney(20, 'USD'), '$20');
    assert.equal(formatMoney(12.5, 'USD'), '$12.50');
  });
});

describe('course price label', () => {
  test('shows the price in the course currency', () => {
    assert.equal(formatCoursePrice({ price: 29.99, currency: 'USD' }, 'Not available'), '$29.99');
  });

  test('shows the unavailable label when the country has no price', () => {
    assert.equal(
      formatCoursePrice({ price: 0, currency: 'USD', availableInMarket: false }, 'Not available'),
      'Not available',
    );
  });

  test('older API responses without a currency are rupees', () => {
    assert.equal(formatCoursePrice({ price: 499 }, 'x').replace(/\s/g, ''), '₹499');
  });
});
