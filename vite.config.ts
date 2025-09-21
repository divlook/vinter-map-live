import path from 'path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'
  const isDebugBuild = process.env.BUILD_MODE === 'debug'

  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '~': path.resolve(__dirname, './'),
      },
    },
    build: {
      outDir: isDebugBuild ? 'dist-debug' : 'dist',
      minify: isProduction ? 'esbuild' : false,
    },
    esbuild: {
      // production 빌드이면서 debug 모드가 아닐 때만 console 제거
      drop: isProduction && !isDebugBuild ? ['console', 'debugger'] : [],
    },
  }
})
