export const logger = {
  log: (...messages: Parameters<typeof console.log>) => {
    console.log('[log]', ...messages)
  },
  error: (...messages: Parameters<typeof console.error>) => {
    console.error('[error]', ...messages)
  },
}
