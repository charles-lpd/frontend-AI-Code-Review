import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      // Radix primitives and the application must share the exact same React
      // module instance, otherwise hooks resolve against different dispatchers.
      react: new URL('./node_modules/react', import.meta.url).pathname,
      'react-dom': new URL('./node_modules/react-dom', import.meta.url).pathname,
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@radix-ui/react-tooltip'],
  },
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          // 用正则 + 路径边界匹配，避免字符串 includes 误判
          // （例如 /node_modules/xxx/node_modules/react/ 这种嵌套安装场景）
          if (
            /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|use-sync-external-store|react-is)[\\/]/.test(
              id,
            )
          ) {
            return 'react-core';
          }

          if (
            /[\\/]node_modules[\\/](react-markdown|remark-gfm|react-syntax-highlighter)[\\/]/.test(
              id,
            )
          ) {
            return 'markdown';
          }

          if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) {
            return 'icons';
          }

          return 'vendor';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
