import { MAX_IMAGE_BYTES } from './format';
import { convertHeicToJpeg, isHeicImage } from './productImagePrepare';

const LARGE_PHOTO_MAX_EDGE_PX = 2000;

/**
 * Gets a picked photo ready to upload as-is (course thumbnails, tutor photos):
 * iPhone HEIC/HEIF becomes JPEG, and a photo over the 5 MB limit is shrunk to fit.
 */
export async function prepareUploadImage(original: File): Promise<File> {
  let file = isHeicImage(original) ? await convertHeicToJpeg(original) : original;
  if (file.size <= MAX_IMAGE_BYTES) return file;

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Could not read this image. Try another JPG, PNG, or WebP.');
  });
  try {
    const scale = Math.min(1, LARGE_PHOTO_MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process this image in the browser.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Could not shrink this image.');
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    file = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
    return file;
  } finally {
    bitmap.close();
  }
}
