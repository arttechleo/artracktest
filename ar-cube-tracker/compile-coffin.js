import { OfflineCompiler } from 'mind-ar/src/image-target/offline-compiler.js';
import { loadImage } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'fs';

// Single optimized coffin target (CLAHE + sharpened, SIFT-best of 35 day/night shots)
const SRC = 'public/targets/coffin_front.jpg';

const img = await loadImage(SRC);
console.log(`Loaded ${SRC} (${img.width}x${img.height})`);

const compiler = new OfflineCompiler();
console.log('Compiling single coffin target...');
await compiler.compileImageTargets([img], (p) => {
  process.stdout.write(`\r  Progress: ${p.toFixed(1)}%   `);
});

mkdirSync('public', { recursive: true });
writeFileSync('public/targets.mind', Buffer.from(compiler.exportData()));
console.log(`\nDone → public/targets.mind (1 target, index [0] = coffin_front)`);
