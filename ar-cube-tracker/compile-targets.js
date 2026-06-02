import { OfflineCompiler } from 'mind-ar/src/image-target/offline-compiler.js';
import { loadImage } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const EXTS = ['.jpg', '.jpeg', '.png'];

function collectImages(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectImages(full)); // recurse into day/ night/
    } else if (EXTS.includes(extname(entry).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

const imagePaths = collectImages('trackimages');
console.log(`Found ${imagePaths.length} images across all subfolders:`);
imagePaths.forEach(p => console.log(' ', p));

const compiler = new OfflineCompiler();
const images = [];

for (const p of imagePaths) {
  const img = await loadImage(p);
  images.push(img);
  console.log(`Loaded: ${p} (${img.width}x${img.height})`);
}

console.log('\nCompiling targets — this may take a few minutes...');
await compiler.compileImageTargets(images, (progress) => {
  process.stdout.write(`\r  Progress: ${progress.toFixed(1)}%   `);
});

console.log('\nExporting...');
mkdirSync('public', { recursive: true });
writeFileSync('public/targets.mind', Buffer.from(compiler.exportData()));
console.log(`Done → public/targets.mind  (${imagePaths.length} targets)`);
console.log('\nTarget index map:');
imagePaths.forEach((p, i) => console.log(`  [${i}] ${p}`));
