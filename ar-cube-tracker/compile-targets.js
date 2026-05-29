import { OfflineCompiler } from 'mind-ar/src/image-target/offline-compiler.js';
import { loadImage } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync, readdirSync } from 'fs';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function getTrackImages() {
  const dir = join(__dirname, 'trackimages');
  return readdirSync(dir)
    .filter(f => IMAGE_EXTS.has(extname(f).toLowerCase()))
    .sort()
    .map(f => join('trackimages', f));
}

async function main() {
  const imagePaths = getTrackImages();
  if (imagePaths.length === 0) {
    console.error('No images found in trackimages/');
    process.exit(1);
  }

  console.log(`Loading ${imagePaths.length} image(s)...`);
  const images = [];
  for (let i = 0; i < imagePaths.length; i++) {
    const img = await loadImage(imagePaths[i]);
    images.push(img);
    console.log(`  [${i + 1}] ${imagePaths[i]} — ${img.width}x${img.height}`);
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
