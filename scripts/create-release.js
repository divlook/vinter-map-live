// @ts-check
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import process from 'process'

const PROD_ASSET_FILE_NAME = 'dist.zip'
const DEBUG_ASSET_FILE_NAME = 'dist-debug.zip'

/**
 * @param {string} command
 */
const exec = (command) =>
  execSync(command, {
    env: process.env,
  })
    .toString()
    .trim()

/**
 * @param {import('@actions/github-script').AsyncFunctionArguments} scope
 */
export default async (scope) => {
  const { github, context, core } = scope
  try {
    const version = exec('npx git-cliff --bumped-version')

    exec(`npm version ${version}`)

    // 두 가지 버전 빌드
    exec(`npm run build`)
    exec(`npm run build:debug`)

    exec(`git push origin`)
    exec(`git push origin --tags`)

    const changelog = exec('npx git-cliff --latest')

    const release = await github.rest.repos.createRelease({
      owner: context.repo.owner,
      repo: context.repo.repo,
      tag_name: version,
      body: changelog,
    })

    // Production 버전 업로드
    await github.rest.repos.uploadReleaseAsset({
      owner: context.repo.owner,
      repo: context.repo.repo,
      // @ts-ignore
      data: fs.readFileSync(path.join(process.cwd(), PROD_ASSET_FILE_NAME)),
      name: `vinter-map-live@${version}.zip`,
      release_id: release.data.id,
    })

    // Debug 버전 업로드
    await github.rest.repos.uploadReleaseAsset({
      owner: context.repo.owner,
      repo: context.repo.repo,
      // @ts-ignore
      data: fs.readFileSync(path.join(process.cwd(), DEBUG_ASSET_FILE_NAME)),
      name: `vinter-map-live.debug@${version}.zip`,
      release_id: release.data.id,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    core.setFailed(errorMessage)
  }
}
