import js from '@eslint/js'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  {
    ignores: ['dist'],
  },
  {
    files: ['**/*.{ts,js}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': 0,
    },
  },
  eslintPluginPrettierRecommended,
)
