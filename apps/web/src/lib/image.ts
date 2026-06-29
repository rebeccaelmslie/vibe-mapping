// Turns a user-picked reference image into a small, model-ready payload.
// We downscale client-side so the chat request stays light and Claude's vision
// pass is fast — the long edge is capped well under Anthropic's 1568px limit.

export interface InspirationImage {
  /** data: URL for previewing the thumbnail in the composer + message bubble. */
  dataUrl: string;
  /** Anthropic image media type, e.g. "image/jpeg". */
  mediaType: string;
  /** Base64 payload (no data: prefix) for the image content block. */
  data: string;
}

const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.85;

export class ImageTooLargeError extends Error {}
export class NotAnImageError extends Error {}

/**
 * Read, downscale, and re-encode an image file to a base64 JPEG payload.
 * Throws NotAnImageError / ImageTooLargeError so the caller can surface a
 * friendly message instead of a silent failure.
 */
export async function fileToInspirationImage(file: File): Promise<InspirationImage> {
  if (!file.type.startsWith('image/')) {
    throw new NotAnImageError('That file is not an image.');
  }
  // 15 MB pre-downscale guard — phone photos can be big before we shrink them.
  if (file.size > 15 * 1024 * 1024) {
    throw new ImageTooLargeError('Image is too large (max 15 MB).');
  }

  const bitmap = await loadBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get a 2D canvas context.');
    // Flatten onto a neutral background so transparent PNGs don't go black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const comma = dataUrl.indexOf(',');
    return {
      dataUrl,
      mediaType: 'image/jpeg',
      data: dataUrl.slice(comma + 1),
    };
  } finally {
    bitmap.close?.();
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap & { close?: () => void }> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  // Fallback for browsers without createImageBitmap: decode via <img>.
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new NotAnImageError('Could not decode that image.'));
      el.src = url;
    });
    // Shape-compatible enough for the drawImage path above.
    return img as unknown as ImageBitmap & { close?: () => void };
  } finally {
    URL.revokeObjectURL(url);
  }
}
