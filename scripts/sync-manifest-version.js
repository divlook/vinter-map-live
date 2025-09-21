// @ts-check
import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'

const rootDir = new URL('../', import.meta.url)

/**
 * @param {string | URL} relativePath
 */
const loadJson = async (relativePath) => {
  const fileUrl = new URL(relativePath, rootDir)
  const content = await readFile(fileUrl, 'utf8')
  return { fileUrl, data: JSON.parse(content) }
}

const main = async () => {
  const { data: pkg } = await loadJson('package.json')

  // 명령행 인자로 디렉토리 지정 가능 (기본값: dist)
  const distDir = process.argv[2] || 'dist'

  let manifestPayload

  try {
    manifestPayload = await loadJson(`${distDir}/manifest.json`)
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      console.warn(
        `[sync-manifest-version] ${distDir}/manifest.json not found, skipping`,
      )
      return
    }

    throw error
  }

  const manifest = manifestPayload.data

  if (manifest.version === pkg.version) {
    console.log(`[sync-manifest-version] ${distDir} version already up to date`)
    return
  }

  manifest.version = pkg.version

  await writeFile(
    manifestPayload.fileUrl,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )

  console.log(
    `[sync-manifest-version] ${distDir} manifest version updated to ${manifest.version}`,
  )
}

await main()
