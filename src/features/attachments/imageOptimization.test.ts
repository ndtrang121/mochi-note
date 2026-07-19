import { describe, expect, it } from 'vitest';

import {
  MAX_IMAGE_STORED_BYTES,
  optimizeImageFile,
  targetImageDimensions,
  type ImageOptimizationAdapter,
} from './imageOptimization';

function adapter(encoded: Blob | null): ImageOptimizationAdapter {
  return {
    decode: () => Promise.resolve({ height: 4000, source: {} as CanvasImageSource, width: 3000 }),
    encode: () => Promise.resolve(encoded),
  };
}

describe('image optimization', () => {
  it('calculates bounded dimensions while preserving aspect ratio', () => {
    expect(targetImageDimensions(3000, 4000)).toEqual({ height: 1920, width: 1440 });
    expect(targetImageDimensions(800, 600)).toEqual({ height: 600, width: 800 });
  });

  it('uses a smaller encoded blob for oversized images', async () => {
    const source = new File([new Uint8Array(3 * 1024 * 1024)], 'photo.png', { type: 'image/png' });
    const compressed = new Blob([new Uint8Array(1000)], { type: 'image/webp' });
    const result = await optimizeImageFile(source, adapter(compressed));
    expect(result).toMatchObject({ optimized: true, originalSize: source.size, width: 1440, height: 1920 });
    expect(result.blob).toBe(compressed);
  });

  it('keeps a small source file when decoding fails', async () => {
    const source = new File(['small'], 'photo.jpg', { type: 'image/jpeg' });
    const failing: ImageOptimizationAdapter = {
      decode: () => Promise.reject(new Error('decoder unavailable')),
      encode: () => Promise.resolve(null),
    };
    const result = await optimizeImageFile(source, failing);
    expect(result.blob).toBe(source);
    expect(result.optimized).toBe(false);
  });

  it('rejects an encoded result that remains above the storage limit', async () => {
    const source = new File([new Uint8Array(9 * 1024 * 1024)], 'photo.webp', { type: 'image/webp' });
    const result = optimizeImageFile(source, adapter(new Blob([new Uint8Array(MAX_IMAGE_STORED_BYTES + 1)], { type: 'image/webp' })));
    await expect(result).rejects.toThrow('8 MB');
  });
});
