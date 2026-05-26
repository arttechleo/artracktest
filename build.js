import { cpSync, mkdirSync, copyFileSync } from 'fs';

mkdirSync('dist/src', { recursive: true });
copyFileSync('index.html', 'dist/index.html');
cpSync('src', 'dist/src', { recursive: true });
cpSync('public', 'dist', { recursive: true });
console.log('build complete → dist/');
