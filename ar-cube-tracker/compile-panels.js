import { OfflineCompiler } from 'mind-ar/src/image-target/offline-compiler.js';
import { loadImage } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'fs';

const TARGETS = [
  'trackimages/panels/panel_roses.jpg',
  'trackimages/panels/panel_flower.jpg',
  'trackimages/panels/panel_lotus.jpg',
  'trackimages/panels/panel_sun.jpg',
];

console.log('Compiling 4 panel targets at 1152px...');
const compiler = new OfflineCompiler();
const images = [];
for (const p of TARGETS) {
  const img = await loadImage(p);
  images.push(img);
  console.log(`  [${images.length-1}] ${p} (${img.width}x${img.height})`);
}
await compiler.compileImageTargets(images, p =>
  process.stdout.write(`\r  Progress: ${p.toFixed(1)}%   `)
);
mkdirSync('public', { recursive: true });
writeFileSync('public/targets.mind', Buffer.from(compiler.exportData()));
console.log('\nDone → public/targets.mind (4 targets)');
