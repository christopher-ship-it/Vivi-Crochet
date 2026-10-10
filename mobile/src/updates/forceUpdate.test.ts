import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isBelowMinVersion } from './forceUpdate.ts';

describe('isBelowMinVersion', () => {
  test('older version is blocked', () => {
    assert.equal(isBelowMinVersion('1.0.17', '1.0.18'), true);
    assert.equal(isBelowMinVersion('1.0.9', '1.0.10'), true);
    assert.equal(isBelowMinVersion('1.9.0', '2.0'), true);
  });
  test('same or newer version is allowed', () => {
    assert.equal(isBelowMinVersion('1.0.18', '1.0.18'), false);
    assert.equal(isBelowMinVersion('1.1.0', '1.0.18'), false);
    assert.equal(isBelowMinVersion('2.0', '1.0.18'), false);
  });
  test('blank minimum never blocks', () => {
    assert.equal(isBelowMinVersion('1.0.0', ''), false);
    assert.equal(isBelowMinVersion('1.0.0', null), false);
  });
});
