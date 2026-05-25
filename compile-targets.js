import { OfflineCompiler } from 'mind-ar/src/image-target/offline-compiler.js';
import { loadImage } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const imagePaths = [
  'trackimages/Image1.jpg',
  'trackimages/Image2.jpg',
  'trackimages/Image3.jpg',
];

async function main() {
  console.log('Loading images...');
  const images = [];
  for (let i = 0; i < imagePaths.length; i++) {
    const img = await loadImage(imagePaths[i]);
    images.push(img);
    console.log(`  Image${i + 1}: ${img.width}x${img.height}`);
  }

  const compiler = new OfflineCompiler();

  console.log('Compiling targets...');
  await compiler.compileImageTargets(images, (progress) => {
    process.stdout.write(`\r  Progress: ${progress.toFixed(1)}%   `);
  });
  console.log('\nExporting...');

  const buffer = compiler.exportData();
  mkdirSync('public', { recursive: true });
  writeFileSync('public/targets.mind', Buffer.from(buffer));
  console.log('Done → public/targets.mind');
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
