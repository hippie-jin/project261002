// PM2 프로세스 정의 (Docker 미사용 — research R13)
// 공용 Nginx: https://p2.sumzip.com → 192.168.0.19:9502 (frontend) → /api → 127.0.0.1:9522 (backend)
const path = require('node:path')
const root = path.resolve(__dirname, '..')
module.exports = {
  apps: [
    {
      name: 'hrh-backend',
      cwd: path.join(root, 'backend'),
      script: 'dist/src/server.js',
      env: { NODE_ENV: 'production' },
      max_restarts: 10,
    },
    {
      name: 'hrh-frontend',
      cwd: path.join(root, 'frontend'),
      script: 'node_modules/vite/bin/vite.js',
      args: 'preview --host 0.0.0.0 --port 9502 --strictPort',
      max_restarts: 10,
    },
  ],
}
