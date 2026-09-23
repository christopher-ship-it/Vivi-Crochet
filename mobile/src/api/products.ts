import { apiRequest } from './client';
import type { Product, ProductType } from '../types';

/** Preferred shop order: T-Shirt Yarn first (fills a full row), then Rose, then others. */
function categoryRank(category: string): number {
  const key = category.trim().toLowerCase();
  if (key.includes('t-shirt') || key.includes('tshirt')) return 0;
  if (key.includes('rose')) return 1;
  return 50;
}

/** Keep same categories adjacent so Shop grid rows group T-Shirt / Rose together. */
export function sortProductsForShop(products: Product[]): Product[] {
  return [...products].sort((a, b) => {
    const byRank = categoryRank(a.category) - categoryRank(b.category);
    if (byRank !== 0) return byRank;
    const byCategory = a.category.localeCompare(b.category, undefined, { sensitivity: 'base' });
    if (byCategory !== 0) return byCategory;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export function sortCategoriesForShop(categories: string[]): string[] {
  return [...categories].sort((a, b) => {
    const byRank = categoryRank(a) - categoryRank(b);
    if (byRank !== 0) return byRank;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });
}

export function productTypeForRoom(room: 'handmade' | 'essentials'): ProductType {
  return room === 'essentials' ? 'Resell' : 'Handmade';
}

export async function listProducts(
  category?: string,
  query?: string,
  productType?: ProductType,
): Promise<Product[]> {
  const params = new URLSearchParams();
  if (category && category !== 'All') params.set('category', category);
  if (query?.trim()) params.set('q', query.trim());
  if (productType) params.set('productType', productType);
  const qs = params.toString();
  const products = await apiRequest<Product[]>(`/api/products${qs ? `?${qs}` : ''}`, {}, false);
  const scoped = productType
    ? products.filter((p) => (p.productType ?? 'Handmade') === productType)
    : products;
  return sortProductsForShop(scoped);
}

export async function listProductCategories(productType?: ProductType): Promise<string[]> {
  const params = new URLSearchParams();
  if (productType) params.set('productType', productType);
  const qs = params.toString();
  const categories = await apiRequest<string[]>(
    `/api/products/categories${qs ? `?${qs}` : ''}`,
    {},
    false,
  );
  return sortCategoriesForShop(categories);
}

export async function getProduct(id: string): Promise<Product> {
  return apiRequest<Product>(`/api/products/${id}`, {}, false);
}
