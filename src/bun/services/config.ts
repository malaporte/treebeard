import path from 'node:path'
import { Utils } from 'electrobun/bun'
import type { AppConfig } from '../../shared/types'

const CONFIG_FILENAME = 'treebeard-config.json'

// Match the directory electron-store used so existing configs carry over
const CONFIG_DIR = path.join(Utils.paths.appData, 'Treebeard')

const DEFAULTS: AppConfig = {
  repositories: [],
  pollIntervalSec: 60,
  collapsedRepos: []
}

function configPath(): string {
  return path.join(CONFIG_DIR, CONFIG_FILENAME)
}

function readConfig(): AppConfig {
  try {
    const raw = Bun.file(configPath())
    // Bun.file().text() is async, use node:fs for sync read
    const fs = require('node:fs')
    const text = fs.readFileSync(configPath(), 'utf-8')
    return { ...DEFAULTS, ...JSON.parse(text) }
  } catch {
    return { ...DEFAULTS }
  }
}

function writeConfig(config: AppConfig): void {
  const fs = require('node:fs')
  const dir = CONFIG_DIR
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2))
}

export function getConfig(): AppConfig {
  return readConfig()
}

export function setConfig(config: AppConfig): void {
  writeConfig(config)
}

export function getCollapsedRepos(): string[] {
  return readConfig().collapsedRepos
}

export function setCollapsedRepos(ids: string[]): void {
  const config = readConfig()
  config.collapsedRepos = ids
  writeConfig(config)
}
