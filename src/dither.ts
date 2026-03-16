/**
 * 1-bit dithering: none (threshold), Floyd–Steinberg, ordered (Bayer), Atkinson.
 * Input: grayscale 0–255, output: 0 or 1 per pixel (thermal: 1 = burn).
 */

export type DitherAlgo = 'none' | 'floyd-steinberg' | 'ordered' | 'atkinson';

/** Bayer 4x4 matrix (values 0–15), threshold at 8 for 50% */
const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export function to1Bit(
  gray: Buffer,
  width: number,
  height: number,
  algo: DitherAlgo,
  threshold: number
): Buffer {
  const out = Buffer.alloc(width * height);
  if (algo === 'none') {
    for (let i = 0; i < gray.length; i++) {
      out[i] = gray[i] >= threshold ? 0 : 1;
    }
    return out;
  }
  if (algo === 'ordered') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bayerVal = (BAYER_4[y % 4][x % 4] / 16) * 255;
        out[y * width + x] = gray[y * width + x] <= bayerVal ? 1 : 0;
      }
    }
    return out;
  }
  // Floyd–Steinberg and Atkinson need a mutable float copy for error diffusion
  const f = new Float64Array(gray.length);
  for (let i = 0; i < gray.length; i++) f[i] = gray[i];

  if (algo === 'floyd-steinberg') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const old = f[i];
        const v = old >= 128 ? 255 : 0;
        out[i] = v === 255 ? 0 : 1;
        const err = old - v;
        if (x + 1 < width) f[i + 1] += (7 / 16) * err;
        if (y + 1 < height) {
          if (x > 0) f[i + width - 1] += (3 / 16) * err;
          f[i + width] += (5 / 16) * err;
          if (x + 1 < width) f[i + width + 1] += (1 / 16) * err;
        }
      }
    }
    return out;
  }
  // Atkinson
  if (algo === 'atkinson') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const old = f[i];
        const v = old >= 128 ? 255 : 0;
        out[i] = v === 255 ? 0 : 1;
        const err = (old - v) / 8;
        if (x + 1 < width) f[i + 1] += err;
        if (x + 2 < width) f[i + 2] += err;
        if (y + 1 < height) {
          if (x > 0) f[i + width - 1] += err;
          f[i + width] += err;
          if (x + 1 < width) f[i + width + 1] += err;
        }
        if (y + 2 < height) f[i + 2 * width] += err;
      }
    }
    return out;
  }
  return out;
}
