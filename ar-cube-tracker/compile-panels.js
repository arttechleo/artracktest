import { OfflineCompiler } from 'mind-ar/src/image-target/offline-compiler.js';
import { loadImage } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'fs';

// Order MUST match src/app.js anchor map:
// [0] panel_roses  [1] panel_flower  [2] panel_lotus  [3] panel_sun
const PANELS = [
  'trackimages/panels/panel_roses.jpg',
  'trackimages/panels/panel_flower.jpg',
  'trackimages/panels/panel_lotus.jpg',
  'trackimages/panels/panel_sun.jpg',
];

const images = [];
for (const p of PANELS) {
  const img = await loadImage(p);
  images.push(img);
  console.log(`Loaded ${p} (${img.width}x${img.height})`);
}

const compiler = new OfflineCompiler();
console.log('Compiling 4 panel targets...');
await compiler.compileImageTargets(images, (p) => {
  process.stdout.write(`\r  Progress: ${p.toFixed(1)}%   `);
});

mkdirSync('public', { recursive: true });
writeFileSync('public/targets.mind', Buffer.from(compiler.exportData()));
console.log('\nDone -> public/targets.mind (4 targets)');
PANELS.forEach((p, i) => console.log(`  [${i}] ${p}`));
