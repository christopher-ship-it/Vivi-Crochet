import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { sessionStartMinutes, sortSlotsByTime } from './liveSessions.ts';

describe('sessionStartMinutes', () => {
  test('reads 12-hour times', () => {
    assert.equal(sessionStartMinutes('10:00 AM – 12:00 PM'), 600);
    assert.equal(sessionStartMinutes('6:00 PM – 8:00 PM'), 1080);
    assert.equal(sessionStartMinutes('1:30 pm - 3:30 pm'), 810);
  });

  test('handles noon and midnight', () => {
    assert.equal(sessionStartMinutes('12:00 PM – 2:00 PM'), 720);
    assert.equal(sessionStartMinutes('12:15 AM – 1:00 AM'), 15);
  });

  test('reads 24-hour times', () => {
    assert.equal(sessionStartMinutes('14:00 – 16:00'), 840);
  });

  test('returns null when there is no readable time', () => {
    assert.equal(sessionStartMinutes('Afternoon'), null);
    assert.equal(sessionStartMinutes(''), null);
    assert.equal(sessionStartMinutes(undefined), null);
  });
});

describe('sortSlotsByTime', () => {
  const slot = (name: string, hours?: string) => ({ name, hours });

  test('puts an additional mid-day session between Morning and Evening', () => {
    // The API returns them in session-type order: Morning, Evening, then additional ones.
    const sorted = sortSlotsByTime([
      slot('Morning', '10:00 AM – 12:00 PM'),
      slot('Evening', '6:00 PM – 8:00 PM'),
      slot('Mid-day', '1:00 PM – 3:00 PM'),
    ]);
    assert.deepEqual(sorted.map((s) => s.name), ['Morning', 'Mid-day', 'Evening']);
  });

  test('keeps the original order for sessions that start at the same time', () => {
    const sorted = sortSlotsByTime([
      slot('A', '10:00 AM – 11:00 AM'),
      slot('B', '10:00 AM – 12:00 PM'),
    ]);
    assert.deepEqual(sorted.map((s) => s.name), ['A', 'B']);
  });

  test('moves sessions with unreadable timing to the end, in their own order', () => {
    const sorted = sortSlotsByTime([
      slot('Unknown 1', 'TBA'),
      slot('Evening', '6:00 PM – 8:00 PM'),
      slot('Unknown 2'),
      slot('Morning', '10:00 AM – 12:00 PM'),
    ]);
    assert.deepEqual(sorted.map((s) => s.name), ['Morning', 'Evening', 'Unknown 1', 'Unknown 2']);
  });

  test('does not change the array it is given', () => {
    const input = [slot('Evening', '6:00 PM – 8:00 PM'), slot('Morning', '10:00 AM – 12:00 PM')];
    sortSlotsByTime(input);
    assert.deepEqual(input.map((s) => s.name), ['Evening', 'Morning']);
  });
});
