import type { Product, RecommendedEssentialSummary } from '../types';

/** "Beginner kit", "Beginner's Kit", "beginners-kit" … in any case. */
const BEGINNER_KIT_NAME = /beginner[’']?s?[\s-]*kit/i;

type KitCandidate = Pick<
  Product,
  'id' | 'name' | 'category' | 'price' | 'imageUrl' | 'availableStock' | 'status' | 'productType'
> & { variantCount?: number };

/**
 * The Crochet Essentials product the shop calls its beginner kit: found by name, so the shop
 * owner only has to name the product "Beginner kit". Skipped when it is sold out, unpublished, or
 * a listing with shades (a shade has to be chosen on its own page, so it can't be added from the
 * cart). With several matches, the one named exactly "Beginner kit" wins, then the first in shop order.
 */
export function findBeginnerKit<T extends KitCandidate>(products: readonly T[]): T | null {
  const usable = products.filter(
    (p) =>
      (p.productType ?? 'Handmade') === 'Resell' &&
      p.status !== 'Draft' &&
      p.availableStock > 0 &&
      !(p.variantCount && p.variantCount > 0) &&
      BEGINNER_KIT_NAME.test(p.name),
  );
  if (usable.length === 0) return null;
  const exact = usable.find((p) => p.name.trim().toLowerCase() === 'beginner kit');
  return exact ?? usable[0];
}

/** The shape the cart's suggestion card uses. */
export function kitToSuggestion(kit: KitCandidate): RecommendedEssentialSummary {
  return {
    id: kit.id,
    name: kit.name,
    category: kit.category,
    price: kit.price,
    imageUrl: kit.imageUrl,
    availableStock: kit.availableStock,
  };
}
