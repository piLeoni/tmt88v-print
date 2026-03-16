/**
 * tmt88v-print – Print images to Epson TM-T88V (80mm, 512 dots) via ESC/POS.
 * No CUPS/lp: sends directly to device (e.g. /dev/usb/lp2).
 */

import * as fs from 'fs';
import sharp from 'sharp';
import { to1Bit, type DitherAlgo } from './dither';

export const PRINT_WIDTH = 512; // TM-T88V: 72mm printable = 512 dots

export type FitMode = 'inside' | 'fill' | 'stretch';

export interface ImageToEscposOptions {
  chunkHeight?: number;
  width?: number;
  fit?: FitMode;
  height?: number;
  dither?: DitherAlgo;
  threshold?: number;
}

export interface PrintImageOptions extends ImageToEscposOptions {
  device?: string;
}

const DEFAULT_OPTIONS: Required<Omit<ImageToEscposOptions, 'height'>> = {
  chunkHeight: 0,
  width: PRINT_WIDTH,
  fit: 'inside',
  dither: 'none',
  threshold: 128,
};

function sharpFit(fit: FitMode): 'inside' | 'cover' | 'fill' {
  if (fit === 'inside') return 'inside';
  if (fit === 'fill') return 'cover';
  return 'fill';
}

/**
 * Convert image path or buffer to ESC/POS raster (GS v 0).
 */
export async function imageToEscpos(
  input: string | Buffer,
  options: ImageToEscposOptions = {}
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { chunkHeight, width, fit, height, dither, threshold } = opts;

  let pipeline = sharp(input).grayscale();
  const meta = await pipeline.metadata();
  const iw = meta.width ?? 1;
  const ih = meta.height ?? 1;

  if (fit === 'inside') {
    pipeline = pipeline.resize(width, height ?? undefined, { fit: 'inside' });
  } else if (fit === 'fill') {
    const h = height ?? Math.round(ih * (width / iw));
    pipeline = pipeline.resize(width, h, { fit: 'cover' });
  } else {
    const h = height ?? Math.round(ih * (width / iw));
    pipeline = pipeline.resize(width, h, { fit: 'fill' });
  }

  const raw = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const { data, info } = raw;
  const w = info.width;
  const h = info.height;

  // Contrast stretch
  let min = 255, max = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < min) min = data[i];
    if (data[i] > max) max = data[i];
  }
  const span = max - min || 1;
  const stretched = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    stretched[i] = Math.round((255 * (data[i] - min)) / span);
  }
  // Invert so that with raster XOR we get correct image (TM-T88V prints full with this stream)
  for (let i = 0; i < stretched.length; i++) stretched[i] = 255 - stretched[i];

  const bits = to1Bit(stretched, w, h, dither, threshold);
  const widthBytes = Math.ceil(w / 8);
  const out = Buffer.alloc(widthBytes * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = bits[y * w + x];
      if (v) out[y * widthBytes + (x >>> 3)] |= 128 >>> (x & 7);
    }
  }
  // XOR raster: stream that worked without EIO; combined with pre-invert gives correct image
  for (let i = 0; i < out.length; i++) out[i] ^= 0xff;

  const init = Buffer.from([0x1b, 0x40]);
  // Feed several lines so the last printed line passes the cutter, then partial cut (GS V 0)
  const end = Buffer.from([
    0x1b, 0x64, 5, // ESC d 5 = feed 5 lines (paper advances before cut)
    0x1d, 0x56, 0x00, // GS V 0 = partial cut
  ]);

  if (chunkHeight && h > chunkHeight) {
    const chunks: Buffer[] = [];
    let y = 0;
    while (y < h) {
      const stripH = Math.min(chunkHeight, h - y);
      chunks.push(buildRasterChunk(out, widthBytes, h, y, stripH));
      y += stripH;
    }
    return Buffer.concat([init, ...chunks, end]);
  }

  const one = buildRasterChunk(out, widthBytes, h, 0, h);
  return Buffer.concat([init, one, end]);
}

function buildRasterChunk(
  fullRaster: Buffer,
  widthBytes: number,
  _h: number,
  startY: number,
  stripH: number
): Buffer {
  const hdr = Buffer.alloc(8);
  hdr[0] = 0x1d;
  hdr[1] = 0x76;
  hdr[2] = 0x30;
  hdr[3] = 0x00;
  hdr.writeUInt16LE(widthBytes, 4);
  hdr.writeUInt16LE(stripH, 6);
  const strip = Buffer.alloc(widthBytes * stripH);
  for (let i = 0; i < stripH; i++) {
    fullRaster.copy(
      strip,
      i * widthBytes,
      (startY + i) * widthBytes,
      (startY + i + 1) * widthBytes
    );
  }
  return Buffer.concat([hdr, strip]);
}

/**
 * Print image to device.
 */
export async function printImage(
  imagePath: string,
  options: PrintImageOptions = {}
): Promise<void> {
  const device = options.device ?? process.env.PRINTER_DEVICE ?? '/dev/usb/lp2';
  const chunkHeight = options.chunkHeight ?? 400;
  const escpos = await imageToEscpos(imagePath, { ...options, chunkHeight });
  fs.writeFileSync(device, escpos);
}

export type { DitherAlgo };
