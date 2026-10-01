/**
 * Matches a photo's file name to a product code. No imports, so it can be unit tested with
 * `node --test`.
 *
 * Rules, in order:
 *  1. The exact file name listed in the sheet's "Image filename" column (any case).
 *  2. A file name that starts with a product code followed by a separator or the end:
 *     DSR001_Lilac.jpg, dsr001 lilac.jpg and DSR001.png all match DSR001, but DSR001.jpg never
 *     matches DSR00. When several codes fit, the longest wins.
 */
export function matchPhotoToCode(
  fileName: string,
  codes: readonly string[],
  sheetFileNames: ReadonlyMap<string, string> = new Map(),
): string | null {
  const lowerName = fileName.trim().toLowerCase();
  const fromSheet = sheetFileNames.get(lowerName);
  if (fromSheet) return fromSheet;

  const base = lowerName.replace(/\.[a-z0-9]+$/, '');
  let best: string | null = null;
  for (const code of codes) {
    const lowerCode = code.toLowerCase();
    if (!lowerCode || !base.startsWith(lowerCode)) continue;
    const next = base.charAt(lowerCode.length);
    const endsHere = next === '' || !/[a-z0-9]/.test(next);
    if (!endsHere) continue;
    if (best === null || code.length > best.length) best = code;
  }
  return best;
}
