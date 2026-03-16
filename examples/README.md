# Examples and local testing

You can test **without a printer** by writing ESC/POS to a file.

## 1. Build and generate a sample image

```bash
cd tmt88v-print
npm install
npm run build
node examples/generate-sample.js
```

This creates `examples/sample.png` (512×200 gradient).

## 2. Convert to ESC/POS (no printer)

```bash
# Write ESC/POS to a file instead of the device
node dist/cli.js examples/sample.png --output examples/out.bin
```

Check that `examples/out.bin` was created and has a reasonable size (e.g. a few KB).

## 3. Try different options

```bash
# Different width (58 mm style)
node dist/cli.js examples/sample.png --output examples/out-384.bin --width 384

# With dither
node dist/cli.js examples/sample.png --output examples/out-dither.bin --dither floyd-steinberg

# Chunk size
node dist/cli.js examples/sample.png --output examples/out.bin --chunk 100
```

## 4. Print to device (when printer is connected)

```bash
# Use your device path (e.g. /dev/usb/lp0 or /dev/usb/lp2)
node dist/cli.js examples/sample.png --device /dev/usb/lp2
# Or: PRINTER_DEVICE=/dev/usb/lp2 node dist/cli.js examples/sample.png
```

## 5. Use from code

```javascript
const { imageToEscpos } = require('tmt88v-print');
const fs = require('fs');

(async () => {
  const escpos = await imageToEscpos('examples/sample.png', {
    width: 512,
    chunkHeight: 400,
    dither: 'none',
    threshold: 128,
  });
  fs.writeFileSync('examples/out.bin', escpos);
  console.log('Wrote', escpos.length, 'bytes');
})();
```
