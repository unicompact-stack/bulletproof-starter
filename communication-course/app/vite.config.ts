/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { contentPlugin } from './vite-plugin-content.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), contentPlugin()],
  server: {
    // 0.0.0.0 обязателен: иначе превью в браузере не достучится до сервера.
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
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
    // jsdom для всех тестов: раньше стоял 'node', а тестам компонентов
    // приходилось включать jsdom докблоком — про него легко забыть.
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
