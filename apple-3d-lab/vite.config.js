import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  resolve: {
    // The lab reuses the real artwork, the voice player and the lesson data.
    alias: { '@apple-school': fileURLToPath(new URL('../apple-school/src', import.meta.url)) },
  },
  server: { host: '0.0.0.0', port: 4174, strictPort: true, allowedHosts: true, fs: { allow: [here, '..'] } },
  preview: { host: '0.0.0.0', port: 4174, strictPort: true, allowedHosts: true },
});
