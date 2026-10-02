import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// 공용 Nginx 가 https://p2.sumzip.com → 192.168.0.19:9502 로 넘긴다. 백엔드는 127.0.0.1:9522 (research R13)
const api = { '^/api/': { target: 'http://127.0.0.1:9522', changeOrigin: false } }

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: null,
      manifest: {
        name: '하루한장',
        short_name: '하루한장',
        description: '하루 장사, 한 장에 담다',
        lang: 'ko',
        start_url: '/today',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,png,svg,woff2}'] },
      devOptions: { enabled: false },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '0.0.0.0', port: 9502, strictPort: true, allowedHosts: ['p2.sumzip.com', 'localhost', '127.0.0.1'], proxy: api },
  preview: { host: '0.0.0.0', port: 9502, strictPort: true, allowedHosts: ['p2.sumzip.com', 'localhost', '127.0.0.1'], proxy: api },
})
