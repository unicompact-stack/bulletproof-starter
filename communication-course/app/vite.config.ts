/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { contentPlugin } from './vite-plugin-content.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), contentPlugin()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    fs: { allow: ['..'] },
  },
  // Mermaid тяжёлый и грузится лениво. Без этого Vite пересобирает его прямо
  // во время работы и перезагружает страницу — выглядит как «приложение сломалось».
  optimizeDeps: {
    include: ['mermaid'],
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
