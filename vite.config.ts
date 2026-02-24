import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: 'localhost', // Changed from 0.0.0.0 for security
    proxy: {
      '/inworld-api': {
        target: 'https://api.inworld.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/inworld-api/, ''),
      },
    },
  },
  plugins: [react()],
  // Removed: define block that exposed API keys to browser
  // Use import.meta.env.VITE_* instead (already used in services)
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },
  json: {
    stringify: true
  }
});
