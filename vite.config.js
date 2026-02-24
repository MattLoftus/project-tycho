import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5176,
    proxy: {
      '/mola': {
        target: 'http://s3-eu-west-1.amazonaws.com/whereonmars.cartodb.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mola/, ''),
      },
      '/terrarium': {
        target: 'https://s3.amazonaws.com/elevation-tiles-prod',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/terrarium/, ''),
      },
      '/esri': {
        target: 'https://server.arcgisonline.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/esri/, ''),
      },
    },
  },
})
