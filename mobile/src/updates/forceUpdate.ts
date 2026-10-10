/** True when `current` is an older dotted version than `minimum` (e.g. 1.0.17 < 1.0.18). Blank minimum never blocks. */
export function isBelowMinVersion(current: string, minimum: string | null | undefined): boolean {
  const min = (minimum ?? '').trim();
  if (!min) return false;
  const a = current.split('.').map((n) => parseInt(n, 10) || 0);
  const b = min.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
