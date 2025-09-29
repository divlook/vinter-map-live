import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = process.env.npm_lifecycle_event === 'dev'
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
    plugins: isDev ? [react(), tailwindcss()] : [],
  }
})
