/**
 * Generate a small sample image (512x200) for local testing.
 * Run: node examples/generate-sample.js
 * Then: node dist/cli.js examples/sample.png --output examples/out.bin
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const outDir = path.join(__dirname);
const samplePath = path.join(outDir, 'sample.png');

async function main() {
  const width = 512;
  const height = 200;
  const buf = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      buf[i] = (x * 255 / width) | 0;     // R gradient
      buf[i + 1] = (y * 255 / height) | 0; // G gradient
      buf[i + 2] = 128;
    }
  }
  await sharp(buf, { raw: { width, height, channels: 3 } })
    .png()
    .toFile(samplePath);
  console.log('Wrote', samplePath);
}

main().catch((e) => { console.error(e); process.exit(1); });
