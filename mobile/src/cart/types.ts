/** Snapshot stored with each cart line — prices refreshed from API when possible. */
export type CartItemType = 'Product' | 'Course' | 'CourseBundle';

export interface CartLineItem {
  /** Defaults to Product for carts saved before mixed checkout. */
  itemType?: CartItemType;
  /** Set when itemType is Product (or legacy lines without itemType). */
  productId?: string;
  /** Set when itemType is Course or CourseBundle. */
  courseId?: string;
  quantity: number;
  name: string;
  price: number;
  imageUrl?: string | null;
  category?: string;
  availableStock?: number;
  /** Handmade vs Resell — Resell (essentials) use a compact cart row. */
  productType?: 'Handmade' | 'Resell';
  /** Shade of a yarn (or other variant) line, so the cart shows which colour was picked. */
  colourName?: string | null;
  productCode?: string | null;
  colourHex?: string | null;
  /** Original price, so the cart can show the discount next to the price. */
  mrp?: number | null;
}

/** "Lilac (DSR001)" for a shade line; null for products without a shade. */
export function cartLineColourLabel(item: CartLineItem): string | null {
  const name = item.colourName?.trim();
  if (!name) return null;
  const code = item.productCode?.trim();
  return code ? `${name} (${code})` : name;
}

export interface CartState {
  items: CartLineItem[];
  updatedAt: string;
}

export function normalizeCartItemType(item: CartLineItem): CartItemType {
  if (item.itemType === 'Course' || item.itemType === 'CourseBundle') return item.itemType;
  return 'Product';
}

export function isProductLine(item: CartLineItem): boolean {
  return normalizeCartItemType(item) === 'Product';
}

export function isCourseLine(item: CartLineItem): boolean {
  const type = normalizeCartItemType(item);
  return type === 'Course' || type === 'CourseBundle';
}

/** Stable key for merge / remove / React lists. */
export function cartLineKey(item: CartLineItem): string {
  if (isCourseLine(item)) return `course:${item.courseId ?? ''}`;
  return `product:${item.productId ?? ''}`;
}
