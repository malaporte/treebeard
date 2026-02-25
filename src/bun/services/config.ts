import path from 'node:path'
import fs from 'node:fs'
import { Utils } from 'electrobun/bun'
import type { AppConfig } from '../../shared/types'

const CONFIG_FILENAME = 'treebeard-config.json'

// ~/Library/Application Support/Treebeard — standard macOS app data location
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
    const text = fs.readFileSync(configPath(), 'utf-8')
    return { ...DEFAULTS, ...JSON.parse(text) }
  } catch {
    return { ...DEFAULTS }
  }
}

function writeConfig(config: AppConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
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
