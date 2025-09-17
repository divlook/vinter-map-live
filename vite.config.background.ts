import { defineConfig, mergeConfig } from 'vite'
import baseConfig from './vite.config'

export default mergeConfig(
  baseConfig,
  defineConfig({
    build: {
      emptyOutDir: false,
      rollupOptions: {
        input: {
          background: './src/chrome/background.ts',
        },
        output: {
          format: 'es',
          entryFileNames: '[name].js',
          inlineDynamicImports: true,
          manualChunks: undefined,
        },
      },
    },
  }),
)
