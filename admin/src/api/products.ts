import { apiRequest } from './client';
import { uploadToBlob } from '../utils/videoUpload';
import { renderProductThumb } from '../utils/productImagePrepare';
import type { Product, ProductImageUploadCompleteRequest, ProductImageUploadUrlRequest, ProductImageUploadUrlResponse, ProductRequest, ProductType } from '../types';

export async function listProducts(productType?: ProductType): Promise<Product[]> {
  const params = new URLSearchParams();
  if (productType) params.set('productType', productType);
  const qs = params.toString();
  return apiRequest<Product[]>(`/api/products${qs ? `?${qs}` : ''}`);
}

export async function listProductCategories(productType?: ProductType): Promise<string[]> {
  const params = new URLSearchParams();
  if (productType) params.set('productType', productType);
  const qs = params.toString();
  return apiRequest<string[]>(`/api/products/categories${qs ? `?${qs}` : ''}`);
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

/**
 * Best effort: makes and uploads the small list thumbnail for a photo that was just uploaded.
 * Returns the fields to merge into image-upload-complete; empty when anything fails (photo still saves).
 */
export async function uploadThumb(
  photo: File,
  ticket: ProductImageUploadUrlResponse,
): Promise<Pick<ProductImageUploadCompleteRequest, 'thumbBlobPath' | 'thumbFileSizeBytes'>> {
  try {
    if (!ticket.thumbUploadUrl || !ticket.thumbBlobPath) return {};
    const thumb = await renderProductThumb(photo);
    if (!thumb) return {};
    const result = await uploadToBlob(ticket.thumbUploadUrl, thumb, 'image/webp');
    if (!result.success) return {};
    return { thumbBlobPath: ticket.thumbBlobPath, thumbFileSizeBytes: thumb.size };
  } catch {
    return {};
  }
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
