import { apiRequest } from './client';
import type { Product } from '../types';

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

export async function listProducts(category?: string, query?: string): Promise<Product[]> {
  const params = new URLSearchParams();
  if (category && category !== 'All') params.set('category', category);
  if (query?.trim()) params.set('q', query.trim());
  const qs = params.toString();
  const products = await apiRequest<Product[]>(`/api/products${qs ? `?${qs}` : ''}`, {}, false);
  return sortProductsForShop(products);
}

export async function listProductCategories(): Promise<string[]> {
  const categories = await apiRequest<string[]>('/api/products/categories', {}, false);
  return sortCategoriesForShop(categories);
}

export async function getProduct(id: string): Promise<Product> {
  return apiRequest<Product>(`/api/products/${id}`, {}, false);
}
