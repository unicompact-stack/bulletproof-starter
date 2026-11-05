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
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
