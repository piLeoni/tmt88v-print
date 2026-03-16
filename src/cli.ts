#!/usr/bin/env node
/**
 * CLI: tmt88v-print <image> [--device] [--chunk] [--output] [--width] [--fit] [--dither] [--threshold]
 */

import { imageToEscpos, type DitherAlgo, type FitMode } from './index';
import * as fs from 'fs';
import * as path from 'path';

const DITHER_VALUES: DitherAlgo[] = ['none', 'floyd-steinberg', 'ordered', 'atkinson'];
const FIT_VALUES: FitMode[] = ['inside', 'fill', 'stretch'];

const DEVICE_WRITE_CHUNK = 1024;
const DEVICE_WRITE_DELAY_MS = 18;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Write ESC/POS to device in small chunks with uniform delay.
 * No handshake: /dev/usb/lp* is write-only from the app; USB flow control is in-kernel.
 * ESC/POS has status commands (e.g. DLE EOT) but reading back on Linux usblp is not reliable.
 * So we use fixed-rate throttling (deterministic: same chunk size and delay every time).
 */
async function writeToDeviceInChunks(device: string, data: Buffer): Promise<void> {
  const fd = fs.openSync(device, 'w');
  try {
    for (let offset = 0; offset < data.length; offset += DEVICE_WRITE_CHUNK) {
      const chunk = data.subarray(offset, Math.min(offset + DEVICE_WRITE_CHUNK, data.length));
      fs.writeSync(fd, chunk);
      if (offset + chunk.length < data.length) await delay(DEVICE_WRITE_DELAY_MS);
    }
  } finally {
    fs.closeSync(fd);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = argv.filter((a) => !a.startsWith('--'));
  let device = process.env.PRINTER_DEVICE ?? '/dev/usb/lp2';
  let chunkHeight = 400;
  let outputPath: string | null = null;
  let width = 512;
  let fit: FitMode = 'inside';
  let dither: DitherAlgo = 'none';
  let threshold = 128;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--device' && argv[i + 1]) device = argv[i + 1];
    if (argv[i] === '--chunk' && argv[i + 1]) chunkHeight = parseInt(argv[i + 1], 10);
    if (argv[i] === '--output' && argv[i + 1]) outputPath = argv[i + 1];
    if (argv[i] === '--width' && argv[i + 1]) width = parseInt(argv[i + 1], 10);
    if (argv[i] === '--fit' && argv[i + 1]) {
      const v = argv[i + 1].toLowerCase();
      if (FIT_VALUES.includes(v as FitMode)) fit = v as FitMode;
    }
    if (argv[i] === '--dither' && argv[i + 1]) {
      const v = argv[i + 1].toLowerCase().replace(/[–—]/g, '-');
      if (DITHER_VALUES.includes(v as DitherAlgo)) dither = v as DitherAlgo;
    }
    if (argv[i] === '--threshold' && argv[i + 1]) threshold = parseInt(argv[i + 1], 10);
  }

  if (!args[0]) {
    console.error(
      'Usage: tmt88v-print <image> [--device PATH] [--chunk N] [--output FILE] [--width N] [--fit inside|fill|stretch] [--dither none|floyd-steinberg|ordered|atkinson] [--threshold N]'
    );
    process.exit(1);
  }

  const imagePath = path.resolve(args[0]);
  if (!fs.existsSync(imagePath)) {
    console.error('File not found:', imagePath);
    process.exit(1);
  }

  try {
    const escpos = await imageToEscpos(imagePath, {
      chunkHeight,
      width,
      fit,
      dither,
      threshold,
    });

    if (outputPath) {
      fs.writeFileSync(outputPath, escpos);
      console.error('Wrote ESC/POS to', outputPath, '(' + escpos.length, 'bytes)');
    } else {
      await writeToDeviceInChunks(device, escpos);
      console.error('Sent to', device);
    }
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    console.error(err?.message ?? String(e));
    if (err?.code === 'ENODEV' && !outputPath) {
      console.error('Printer not found. Check: is it on and connected? List devices: ls /dev/usb/lp*');
    }
    process.exit(1);
  }
}

main();
