const path = require('path');
const { printImage } = require('..');

const samplePath = path.join(__dirname, 'sample.png');

(async () => {
  await printImage(samplePath, { width: 512, chunkHeight: 400 });
  console.log('Printed', samplePath);
})();
