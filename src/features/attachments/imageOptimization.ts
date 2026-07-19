export const MAX_IMAGE_INPUT_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_STORED_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 1920;

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface DecodedImage {
  close?: () => void;
  height: number;
  source: CanvasImageSource;
  width: number;
}

export interface ImageOptimizationAdapter {
  decode: (file: File) => Promise<DecodedImage>;
  encode: (image: DecodedImage, width: number, height: number) => Promise<Blob | null>;
}

export interface OptimizedImage {
  blob: Blob;
  height: number | null;
  optimized: boolean;
  originalSize: number;
  width: number | null;
}

export function targetImageDimensions(width: number, height: number) {
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
}

const browserAdapter: ImageOptimizationAdapter = {
  async decode(file) {
    const bitmap = await createImageBitmap(file);
    return { close: () => bitmap.close(), height: bitmap.height, source: bitmap, width: bitmap.width };
  },
  async encode(image, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return null;
    context.drawImage(image.source, 0, 0, width, height);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
  },
};

export async function optimizeImageFile(file: File, adapter: ImageOptimizationAdapter = browserAdapter): Promise<OptimizedImage> {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new Error('MochiNote chỉ hỗ trợ ảnh JPEG, PNG và WebP.');
  }
  if (file.size > MAX_IMAGE_INPUT_BYTES) {
    throw new Error(`${file.name} vượt giới hạn đầu vào 25 MB.`);
  }

  let image: DecodedImage | null = null;
  try {
    image = await adapter.decode(file);
    const target = targetImageDimensions(image.width, image.height);
    const needsResize = target.width !== image.width || target.height !== image.height;
    const needsCompression = file.size > 2 * 1024 * 1024;
    if (!needsResize && !needsCompression) {
      return { blob: file, height: image.height, optimized: false, originalSize: file.size, width: image.width };
    }
    const encoded = await adapter.encode(image, target.width, target.height);
    const blob = encoded && encoded.size < file.size ? encoded : file;
    if (blob.size > MAX_IMAGE_STORED_BYTES) {
      throw new Error(`${file.name} vẫn vượt giới hạn lưu trữ 8 MB sau khi tối ưu.`);
    }
    return { blob, height: target.height, optimized: blob !== file, originalSize: file.size, width: target.width };
  } catch (error) {
    if (file.size <= MAX_IMAGE_STORED_BYTES && !(error instanceof Error && error.message.includes('vượt giới hạn'))) {
      return { blob: file, height: null, optimized: false, originalSize: file.size, width: null };
    }
    throw error;
  } finally {
    image?.close?.();
  }
}
