import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { uploadToBlob, type UploadProgress } from './videoUpload.ts';

const MB = 1024 * 1024;

type Sent = { url: string; size: number };

/** Stands in for the browser's XMLHttpRequest: records each PUT and answers after a short delay. */
function installFakeXhr(options: { failBlock?: string; status?: number } = {}) {
  const sent: Sent[] = [];
  let inFlight = 0;
  let peak = 0;

  class FakeXhr {
    status = 0;
    statusText = '';
    upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number }) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    private url = '';

    open(_method: string, url: string) {
      this.url = url;
    }
    setRequestHeader() {}
    abort() {
      this.onabort?.();
    }
    send(body: Blob | string) {
      const size = typeof body === 'string' ? body.length : body.size;
      sent.push({ url: this.url, size });
      inFlight++;
      peak = Math.max(peak, inFlight);
      setTimeout(() => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: size });
        inFlight--;
        this.status =
          options.failBlock && this.url.includes(`blockid=${options.failBlock}`) ? (options.status ?? 500) : 201;
        this.onload?.();
      }, 5);
    }
  }

  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;
  return { sent, peak: () => peak };
}

afterEach(() => {
  delete (globalThis as unknown as { XMLHttpRequest?: unknown }).XMLHttpRequest;
});

const URL_BASE = 'https://account.blob.core.windows.net/videos/lesson.mp4?sv=1&sig=abc';
const bigFile = (megabytes: number) => new File([new Uint8Array(megabytes * MB)], 'lesson.mp4');

describe('uploadToBlob (large files)', () => {
  test('sends several blocks at once, then commits them all in order', async () => {
    const fake = installFakeXhr();
    const file = bigFile(64 * 5 + 10); // 330 MB: above the block threshold, 6 blocks

    const result = await uploadToBlob(URL_BASE, file, 'video/mp4');

    assert.equal(result.success, true);
    const blocks = fake.sent.filter((s) => s.url.includes('comp=block&'));
    assert.equal(blocks.length, 6);
    assert.ok(fake.peak() > 1 && fake.peak() <= 4, `expected 2-4 requests at once, saw ${fake.peak()}`);

    const commit = fake.sent.at(-1)!;
    assert.ok(commit.url.includes('comp=blocklist'));
    assert.equal(fake.sent.filter((s) => s.url.includes('comp=blocklist')).length, 1);
  });

  test('progress only ever moves forward and ends at 100%', async () => {
    installFakeXhr();
    const seen: UploadProgress[] = [];

    await uploadToBlob(URL_BASE, bigFile(300), 'video/mp4', (p) => seen.push(p));

    assert.ok(seen.length > 0);
    assert.equal(seen.at(-1)!.percent, 100);
    for (let i = 1; i < seen.length; i++) {
      assert.ok(seen[i].loaded >= seen[i - 1].loaded, 'progress went backwards');
    }
  });

  test('a block that keeps failing stops the upload without committing the file', async () => {
    const fake = installFakeXhr({ failBlock: btoa('000002'), status: 500 });

    const result = await uploadToBlob(URL_BASE, bigFile(64 * 5), 'video/mp4');

    assert.equal(result.success, false);
    assert.equal(fake.sent.some((s) => s.url.includes('comp=blocklist')), false);
  });

  test('an expired upload link is reported straight away, with no retries of that block', async () => {
    const fake = installFakeXhr({ failBlock: btoa('000000'), status: 403 });

    const result = await uploadToBlob(URL_BASE, bigFile(300), 'video/mp4');

    assert.equal(result.success, false);
    assert.equal(result.status, 403);
    const firstBlockAttempts = fake.sent.filter((s) => s.url.includes(`blockid=${encodeURIComponent(btoa('000000'))}`));
    assert.equal(firstBlockAttempts.length, 1);
  });
});
