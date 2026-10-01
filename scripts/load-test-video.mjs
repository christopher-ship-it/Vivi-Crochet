#!/usr/bin/env node
/**
 * Simulates N phones streaming the same video at once and reports whether they'd stall.
 *
 *   node scripts/load-test-video.mjs "<video-url>" [--users 100] [--seconds 60] [--mbps 5] [--chunk-mb 1]
 *
 * Each simulated user downloads the file in range-request chunks, as a progressive player does,
 * and "plays" at --mbps (bytes consumed per second). If its downloaded buffer runs dry, that
 * time counts as stalled. Set --mbps to the real bitrate: file size in bits / duration in seconds.
 *
 * Use a read link (SAS URL) for ONE lesson video, valid for the whole test (default link life is
 * 15 minutes). Only test storage you own. Large runs cost Azure egress: users x mbps x seconds.
 */

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};

if (!url || !/^https?:\/\//i.test(url)) {
  console.error('Usage: node scripts/load-test-video.mjs "<video-url>" [--users 100] [--seconds 60] [--mbps 5] [--chunk-mb 1]');
  console.error('The first argument must be a full http(s) video URL. If you passed a PowerShell variable, it was probably empty.');
  process.exit(1);
}

const USERS = opt('users', 100);
const SECONDS = opt('seconds', 60);
const BYTES_PER_SEC = (opt('mbps', 5) * 1_000_000) / 8;
const CHUNK = Math.round(opt('chunk-mb', 1) * 1024 * 1024);
const BUFFER_AHEAD_SEC = 12; // matches preferredForwardBufferDuration in LessonPlayer

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);

async function totalSize() {
  const res = await fetch(url, { headers: { Range: 'bytes=0-0' } });
  if (!res.ok && res.status !== 206) throw new Error(`Probe failed: HTTP ${res.status}`);
  const range = res.headers.get('content-range'); // bytes 0-0/12345
  await res.arrayBuffer();
  const size = range ? Number(range.split('/')[1]) : Number(res.headers.get('content-length'));
  if (!size) throw new Error('Could not determine file size (server must support Range requests).');
  return size;
}

async function simulateUser(id, size, endAt, stats) {
  let offset = 0;
  let downloaded = 0; // bytes fetched
  const startedAt = Date.now();
  let lastTick = startedAt;
  let played = 0;
  let playing = false;
  let stalledMs = 0;
  let stalls = 0;
  let firstByteMs = null;

  // Advance the playback clock: consume bytes only while there is buffer.
  const tick = () => {
    const now = Date.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;
    if (!playing) {
      if (downloaded - played >= BYTES_PER_SEC * 0.5) playing = true; // ~0.5s to start, like minBufferForPlayback
      else stalledMs += dt * 1000; // includes the initial wait, which the app also reports
      return;
    }
    const want = BYTES_PER_SEC * dt;
    const have = downloaded - played;
    if (have >= want) played += want;
    else {
      played += Math.max(0, have);
      playing = false;
      stalls += 1;
    }
  };

  while (Date.now() < endAt) {
    tick();
    const aheadSec = (downloaded - played) / BYTES_PER_SEC;
    if (aheadSec >= BUFFER_AHEAD_SEC || offset >= size) {
      await sleep(200);
      continue;
    }
    const end = Math.min(offset + CHUNK, size) - 1;
    const t0 = Date.now();
    try {
      const res = await fetch(url, { headers: { Range: `bytes=${offset}-${end}` } });
      if (res.status === 429 || res.status === 503) stats.throttled += 1;
      if (!res.ok && res.status !== 206) {
        stats.errors += 1;
        await res.arrayBuffer().catch(() => {});
        await sleep(1000);
        continue;
      }
      const buf = await res.arrayBuffer();
      const ms = Date.now() - t0;
      if (firstByteMs === null) firstByteMs = Date.now() - startedAt;
      stats.chunkMs.push(ms);
      stats.bytes += buf.byteLength;
      downloaded += buf.byteLength;
      offset += buf.byteLength;
    } catch {
      stats.errors += 1;
      await sleep(1000);
    }
    tick();
  }
  tick();
  stats.users.push({ id, stalledMs, stalls, firstByteMs: firstByteMs ?? -1 });
}

const size = await totalSize();
console.log(`File: ${(size / 1048576).toFixed(0)} MB | users: ${USERS} | ${SECONDS}s | playback ${(BYTES_PER_SEC * 8 / 1e6).toFixed(1)} Mbps`);
console.log(`Needed aggregate throughput: ${((USERS * BYTES_PER_SEC * 8) / 1e6).toFixed(0)} Mbps\n`);

const stats = { bytes: 0, errors: 0, throttled: 0, chunkMs: [], users: [] };
const t0 = Date.now();
const endAt = t0 + SECONDS * 1000;
await Promise.all(Array.from({ length: USERS }, (_, i) => simulateUser(i, size, endAt, stats)));
const elapsed = (Date.now() - t0) / 1000;

const chunk = stats.chunkMs.slice().sort((a, b) => a - b);
const stalled = stats.users.filter((u) => u.stalls > 0);
const startMs = stats.users.map((u) => u.firstByteMs).filter((v) => v >= 0).sort((a, b) => a - b);
const slowStart = stats.users.filter((u) => u.firstByteMs < 0 || u.firstByteMs > 5000);
const over5s = stats.users.filter((u) => u.stalledMs > 5000);

console.log(`Throughput:        ${((stats.bytes * 8) / elapsed / 1e6).toFixed(0)} Mbps total (${(stats.bytes / elapsed / 1048576).toFixed(1)} MB/s)`);
console.log(`Chunk latency:     p50 ${pct(chunk, 0.5)} ms | p95 ${pct(chunk, 0.95)} ms | max ${chunk.at(-1) ?? 0} ms`);
console.log(`Time to first data: p50 ${pct(startMs, 0.5)} ms | p95 ${pct(startMs, 0.95)} ms`);
console.log(`Users that stalled: ${stalled.length}/${USERS}`);
console.log(`Users stalled >5s total: ${over5s.length}/${USERS}   (these would be reported in App health)`);
console.log(`Users with slow start >5s: ${slowStart.length}/${USERS}`);
console.log(`HTTP errors: ${stats.errors} | throttled (429/503): ${stats.throttled}`);
console.log(
  over5s.length === 0 && slowStart.length === 0 && stats.errors === 0
    ? '\nPASS: no user would have waited or buffered over 5s in this run.'
    : '\nFAIL: some users would have waited or buffered over 5s, or hit errors. See numbers above.',
);
