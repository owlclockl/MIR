import { defineConfig } from 'vite';

// allowedHosts: true — чтобы песочница/прокси (превью) доходили до dev-сервера без
// «host not allowed». Bind на 0.0.0.0 обязателен для внешнего превью.
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
});
