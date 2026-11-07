import { networkInterfaces } from 'node:os';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .find(
      item =>
        item &&
        item.family === 'IPv4' &&
        !item.internal &&
        /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address),
    );
  return {
    plugins: [react()],
    base: './',
    define: { __LAN_ORIGIN__: JSON.stringify(command === 'serve' && lan ? `http://${lan.address}:5173` : '') },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } },
    },
  };
});
