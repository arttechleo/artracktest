import { OfflineCompiler } from 'mind-ar/src/image-target/offline-compiler.js';
import { loadImage } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'fs';

const TARGETS = ['trackimages/panels/banner.jpg'];

console.log('Compiling banner target...');
const compiler = new OfflineCompiler();
const images = [];
for (const p of TARGETS) {
  const img = await loadImage(p);
  images.push(img);
  console.log(`  [0] ${p} (${img.width}x${img.height})`);
}
await compiler.compileImageTargets(images, p =>
  process.stdout.write(`\r  Progress: ${p.toFixed(1)}%   `)
);
mkdirSync('public', { recursive: true });
writeFileSync('public/targets.mind', Buffer.from(compiler.exportData()));
console.log('\nDone → public/targets.mind (1 target: banner)');
