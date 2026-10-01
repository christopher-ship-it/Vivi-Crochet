import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { matchPhotoToCode } from './productPhotoMatch.ts';

const codes = ['DSR001', 'DSR002', 'DSR0010', 'HOOK-01', 'DSR00'];

describe('matchPhotoToCode', () => {
  test('matches a file name that starts with the product code', () => {
    assert.equal(matchPhotoToCode('DSR001_Lilac.jpg', codes), 'DSR001');
    assert.equal(matchPhotoToCode('DSR002_Beige.jpeg', codes), 'DSR002');
    assert.equal(matchPhotoToCode('HOOK-01.png', codes), 'HOOK-01');
  });

  test('ignores case and accepts spaces or dashes after the code', () => {
    assert.equal(matchPhotoToCode('dsr001 lilac.JPG', codes), 'DSR001');
    assert.equal(matchPhotoToCode('Dsr002-Beige.webp', codes), 'DSR002');
  });

  test('a shorter code never claims a longer code\'s photo', () => {
    // DSR00 is a valid code too, but DSR0010_Pink.jpg belongs to DSR0010, and DSR001.jpg to DSR001.
    assert.equal(matchPhotoToCode('DSR0010_Pink.jpg', codes), 'DSR0010');
    assert.equal(matchPhotoToCode('DSR001.jpg', codes), 'DSR001');
    assert.equal(matchPhotoToCode('DSR00.jpg', codes), 'DSR00');
  });

  test('a code in the middle of a name does not match', () => {
    assert.equal(matchPhotoToCode('lilac_DSR001.jpg', codes), null);
    assert.equal(matchPhotoToCode('IMG_4021.jpg', codes), null);
  });

  test('the sheet\'s Image filename column wins, in any case', () => {
    const sheet = new Map([['front view.jpg', 'DSR002']]);
    assert.equal(matchPhotoToCode('Front View.JPG', codes, sheet), 'DSR002');
  });

  test('returns null when nothing fits', () => {
    assert.equal(matchPhotoToCode('photo.jpg', []), null);
    assert.equal(matchPhotoToCode('DSR999_X.jpg', codes), null);
  });
});
