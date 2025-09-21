import { defineConfig, mergeConfig } from 'vite'
import baseConfig from './vite.config'

export default defineConfig((env) => {
  const base = baseConfig(env)

  return mergeConfig(base, {
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
  })
})
