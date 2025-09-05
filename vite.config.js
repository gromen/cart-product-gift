import shopify from 'vite-plugin-shopify';

export default {
  plugins: [
    shopify({
      additionalEntrypoints: [
        'frontend/cart-free-sample.js',
        'frontend/cart-free-sample.css',
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
