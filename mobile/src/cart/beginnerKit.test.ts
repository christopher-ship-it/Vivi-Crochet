import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { findBeginnerKit, kitToSuggestion } from './beginnerKit.ts';

type P = Parameters<typeof findBeginnerKit>[0][number];

const product = (over: Partial<P> & { name: string }): P => ({
  id: over.name,
  category: 'Kits',
  price: 799,
  imageUrl: null,
  availableStock: 10,
  status: 'Published',
  productType: 'Resell',
  ...over,
});

describe('findBeginnerKit', () => {
  test('finds a Crochet Essentials product named Beginner kit, in any spelling or case', () => {
    for (const name of ['Beginner kit', 'BEGINNER KIT', "Beginner's Kit", 'Beginners-Kit', 'VIVI Beginner Kit (Starter)']) {
      assert.equal(findBeginnerKit([product({ name: 'Yarn' }), product({ name })])?.name, name);
    }
  });

  test('returns null when there is no kit', () => {
    assert.equal(findBeginnerKit([]), null);
    assert.equal(findBeginnerKit([product({ name: 'Cotton yarn' }), product({ name: 'Hook set' })]), null);
  });

  test('ignores a kit that is sold out, unpublished, or a handmade product', () => {
    assert.equal(findBeginnerKit([product({ name: 'Beginner kit', availableStock: 0 })]), null);
    assert.equal(findBeginnerKit([product({ name: 'Beginner kit', status: 'Draft' })]), null);
    assert.equal(findBeginnerKit([product({ name: 'Beginner kit', productType: 'Handmade' })]), null);
  });

  test('ignores a listing with shades, which cannot be added without choosing one', () => {
    assert.equal(findBeginnerKit([product({ name: 'Beginner kit', variantCount: 4 })]), null);
  });

  test('prefers the product named exactly Beginner kit, then the first in shop order', () => {
    const fancy = product({ name: 'Beginner kit deluxe', id: 'deluxe' });
    const plain = product({ name: 'Beginner Kit', id: 'plain' });
    assert.equal(findBeginnerKit([fancy, plain])?.id, 'plain');
    assert.equal(findBeginnerKit([fancy, product({ name: 'Beginner kit pro', id: 'pro' })])?.id, 'deluxe');
  });
});

describe('kitToSuggestion', () => {
  test('keeps only what the suggestion card needs', () => {
    const kit = product({ name: 'Beginner kit', id: 'k1', imageUrl: 'https://x/y.jpg', price: 899, availableStock: 3 });
    assert.deepEqual(kitToSuggestion(kit), {
      id: 'k1',
      name: 'Beginner kit',
      category: 'Kits',
      price: 899,
      imageUrl: 'https://x/y.jpg',
      availableStock: 3,
    });
  });
});
