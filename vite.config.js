import shopify from 'vite-plugin-shopify';

export default {
  plugins: [
    shopify({
      additionalEntrypoints: [
        'frontend/cart-progress-bar.js',
        'frontend/cart-progress-bar.css',
      ],

      snippetFile: 'vite-tag.liquid',
    }),
  ],

  server: {
    cors: true,
    port: 3000,
    hmr: {
      port: 3001,
    },
  },

  build: {
    outDir: 'assets',
    assetsDir: '',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: '[name].[hash].js',
        chunkFileNames: '[name].[hash].js',
        assetFileNames: '[name].[hash].[ext]',
      },
    },
  },
};
