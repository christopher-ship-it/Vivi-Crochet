import { isValidPin, normalizePin } from './validation';

export type PincodeLookupResult = {
  city: string;
  state: string;
};

/** Resolves district + state for an Indian PIN using postalpincode.in (best-effort). */
export async function lookupIndianPincode(pin: string): Promise<PincodeLookupResult | null> {
  const normalized = normalizePin(pin);
  if (!isValidPin(normalized)) return null;

  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${normalized}`);
    if (!response.ok) return null;
    const data = (await response.json()) as Array<{
      Status?: string;
      PostOffice?: Array<{ District?: string; State?: string; Name?: string }>;
    }>;
    const block = data[0];
    if (block?.Status !== 'Success' || !block.PostOffice?.length) return null;
    const office = block.PostOffice[0];
    const city = (office.District || office.Name || '').trim();
    const state = (office.State || '').trim();
    if (!city || !state) return null;
    return { city, state };
  } catch {
    return null;
  }
}
