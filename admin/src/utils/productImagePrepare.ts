import { MAX_IMAGE_BYTES } from './format';

/** Fixed square size for all shop product photos (Handmade + Essentials). */
export const PRODUCT_IMAGE_EDGE_PX = 1200;

export const PRODUCT_IMAGE_MIME = 'image/jpeg';
export const PRODUCT_IMAGE_EXT = '.jpg';

/** PNG/WebP sources may have transparency; JPEG can't store it (it turns black). */
const ALPHA_IMAGE_MIME = 'image/png';
const ALPHA_IMAGE_EXT = '.png';

export function keepsTransparency(file: File): boolean {
  return /^image\/(png|webp)$/i.test(file.type) || /\.(png|webp)$/i.test(file.name);
}

/**
 * How the source photo sits inside the square frame.
 * zoom 1 = whole photo fits the frame; >1 zooms in, <1 zooms out (adds padding).
 * offsetX/offsetY move the photo, as a fraction of the frame size.
 */
export interface ProductImageView {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export const DEFAULT_PRODUCT_IMAGE_VIEW: ProductImageView = { zoom: 1, offsetX: 0, offsetY: 0 };

/**
 * Draws the photo into a {@link PRODUCT_IMAGE_EDGE_PX} square using the chosen view.
 * Output is PNG when the photo has transparency or leaves an empty margin (kept see-through,
 * so the app's own backdrop shows); otherwise JPEG.
 */
export async function renderProductImage(
  file: File,
  view: ProductImageView = DEFAULT_PRODUCT_IMAGE_VIEW,
): Promise<File> {
  const bitmap = await loadImageBitmap(file);
  try {
    const longSide = Math.max(bitmap.width, bitmap.height);
    if (longSide < 1) {
      throw new Error('Could not read this image. Try another JPG, PNG, or WebP.');
    }

    const edge = PRODUCT_IMAGE_EDGE_PX;

    const k = (edge / longSide) * view.zoom;
    const w = bitmap.width * k;
    const h = bitmap.height * k;
    const left = edge / 2 + view.offsetX * edge - w / 2;
    const top = edge / 2 + view.offsetY * edge - h / 2;

    // Empty margin around the photo (non-square photo, zoomed out, or moved).
    const hasMargin = left > 0.5 || top > 0.5 || left + w < edge - 0.5 || top + h < edge - 0.5;

    const draw = (fillWhite: boolean): HTMLCanvasElement => {
      const canvas = document.createElement('canvas');
      canvas.width = edge;
      canvas.height = edge;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not process this image in the browser.');
      }
      if (fillWhite) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, edge, edge);
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, left, top, w, h);
      return canvas;
    };

    // PNG keeps the margin (and any transparent background) see-through, so the app's
    // own backdrop shows instead of a white box. JPEG can't do that.
    const wantsAlpha = keepsTransparency(file) || hasMargin;
    let mime = wantsAlpha ? ALPHA_IMAGE_MIME : PRODUCT_IMAGE_MIME;
    let blob = await canvasToBlob(draw(!wantsAlpha), mime, 0.88);

    // Uploads are capped at 5 MB: a big opaque photo falls back to JPEG with a white margin.
    if (mime === ALPHA_IMAGE_MIME && !keepsTransparency(file) && blob.size > MAX_IMAGE_BYTES * 0.95) {
      mime = PRODUCT_IMAGE_MIME;
      blob = await canvasToBlob(draw(true), mime, 0.88);
    }

    const ext = mime === ALPHA_IMAGE_MIME ? ALPHA_IMAGE_EXT : PRODUCT_IMAGE_EXT;
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'product';
    const safeBase = baseName.replace(/[^\w.-]+/g, '-').replace(/^\.+/, '') || 'product';
    return new File([blob], `${safeBase}${ext}`, {
      type: mime,
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

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not encode the product photo.'));
          return;
        }
        resolve(blob);
      },
      mime,
      quality,
    );
  });
}

/** iPhone photos (HEIC/HEIF) — most desktop browsers can't open them directly. */
export function isHeicImage(file: File): boolean {
  return /^image\/hei[cf]$/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

/** Converts an iPhone HEIC/HEIF photo to a JPEG the rest of the pipeline can read. */
export async function convertHeicToJpeg(file: File): Promise<File> {
  try {
    // Loaded on demand: the converter is large and only needed for iPhone photos.
    const { default: heic2any } = await import('heic2any');
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    const blob = Array.isArray(result) ? result[0] : result;
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    throw new Error('Could not read this iPhone photo. Try exporting it as JPG and upload again.');
  }
}
