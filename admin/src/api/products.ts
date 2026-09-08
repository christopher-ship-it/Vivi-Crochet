import { apiRequest } from './client';
import type { Product, ProductImageUploadCompleteRequest, ProductImageUploadUrlRequest, ProductImageUploadUrlResponse, ProductRequest } from '../types';

export async function listProducts(): Promise<Product[]> {
  return apiRequest<Product[]>('/api/products');
}

export async function listProductCategories(): Promise<string[]> {
  return apiRequest<string[]>('/api/products/categories');
}

export async function getProduct(id: string): Promise<Product> {
  return apiRequest<Product>(`/api/products/${id}`);
}

export async function createProduct(data: ProductRequest): Promise<Product> {
  return apiRequest<Product>('/api/products', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProduct(id: string, data: ProductRequest): Promise<Product> {
  return apiRequest<Product>(`/api/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteProduct(id: string): Promise<void> {
  return apiRequest<void>(`/api/products/${id}`, { method: 'DELETE' });
}

export async function publishProduct(id: string): Promise<Product> {
  return apiRequest<Product>(`/api/products/${id}/publish`, { method: 'POST' });
}

export async function unpublishProduct(id: string): Promise<Product> {
  return apiRequest<Product>(`/api/products/${id}/unpublish`, { method: 'POST' });
}

export async function requestProductImageUploadUrl(
  id: string,
  data: ProductImageUploadUrlRequest,
): Promise<ProductImageUploadUrlResponse> {
  return apiRequest<ProductImageUploadUrlResponse>(`/api/products/${id}/image-upload-url`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function completeProductImageUpload(
  id: string,
  data: ProductImageUploadCompleteRequest,
): Promise<Product> {
  return apiRequest<Product>(`/api/products/${id}/image-upload-complete`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function setProductMainImage(id: string, imageId: string): Promise<Product> {
  return apiRequest<Product>(`/api/products/${id}/images/${imageId}/set-main`, {
    method: 'POST',
  });
}

export async function deleteProductImage(id: string, imageId: string): Promise<Product> {
  return apiRequest<Product>(`/api/products/${id}/images/${imageId}`, {
    method: 'DELETE',
  });
}
