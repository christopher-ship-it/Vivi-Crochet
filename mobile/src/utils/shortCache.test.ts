import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createShortCache } from './shortCache.ts';

describe('createShortCache', () => {
  test('reuses a fresh result, reloads after the ttl, and forgets failures', async () => {
    let t = 0;
    let calls = 0;
    const cached = createShortCache<number>(1000, () => t);

    const load = async () => ++calls;
    assert.equal(await cached('k', load), 1);
    assert.equal(await cached('k', load), 1);
    t = 1500;
    assert.equal(await cached('k', load), 2);

    await assert.rejects(cached('bad', () => Promise.reject(new Error('x'))));
    assert.equal(await cached('bad', load), 3);
  });
});
