/** Fixed square size for all shop product photos (Handmade + Essentials). */
export const PRODUCT_IMAGE_EDGE_PX = 1200;

export const PRODUCT_IMAGE_MIME = 'image/jpeg';
export const PRODUCT_IMAGE_EXT = '.jpg';

/**
 * Center-crops to a square, then scales to {@link PRODUCT_IMAGE_EDGE_PX}×same.
 * Output is always JPEG so every listing photo is a consistent 1200×1200.
 */
export async function prepareProductImage(file: File): Promise<File> {
  const bitmap = await loadImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    if (side < 1) {
      throw new Error('Could not read this image. Try another JPG, PNG, or WebP.');
    }

    const sx = Math.floor((bitmap.width - side) / 2);
    const sy = Math.floor((bitmap.height - side) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = PRODUCT_IMAGE_EDGE_PX;
    canvas.height = PRODUCT_IMAGE_EDGE_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not process this image in the browser.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      bitmap,
      sx,
      sy,
      side,
      side,
      0,
      0,
      PRODUCT_IMAGE_EDGE_PX,
      PRODUCT_IMAGE_EDGE_PX,
    );

    const blob = await canvasToJpegBlob(canvas, 0.88);
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'product';
    const safeBase = baseName.replace(/[^\w.-]+/g, '-').replace(/^\.+/, '') || 'product';
    return new File([blob], `${safeBase}${PRODUCT_IMAGE_EXT}`, {
      type: PRODUCT_IMAGE_MIME,
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

async function loadImageBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    // Fallback for browsers/files where createImageBitmap fails.
    const url = URL.createObjectURL(file);
    try {
      const img = await loadHtmlImage(url);
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read this image. Try another file.'));
    img.src = url;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not encode the product photo.'));
          return;
        }
        resolve(blob);
      },
      PRODUCT_IMAGE_MIME,
      quality,
    );
  });
}
