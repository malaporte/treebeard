import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import type { AppConfig } from '../../shared/types'

const CONFIG_FILENAME = 'treebeard-config.json'
const MIN_POLL_INTERVAL_SEC = 10
const MAX_POLL_INTERVAL_SEC = 600
const MIN_UPDATE_CHECK_INTERVAL_MIN = 5
const MAX_UPDATE_CHECK_INTERVAL_MIN = 1440

const CONFIG_PATH = path.join(os.homedir(), '.config', 'treebeard')

const DEFAULTS: AppConfig = {
  repositories: [],
  pollIntervalSec: 60,
  autoUpdateEnabled: true,
  updateCheckIntervalMin: 30,
  collapsedRepos: []
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function sanitizeConfig(config: Partial<AppConfig>): AppConfig {
  const pollIntervalSec = typeof config.pollIntervalSec === 'number'
    ? clamp(Math.round(config.pollIntervalSec), MIN_POLL_INTERVAL_SEC, MAX_POLL_INTERVAL_SEC)
    : DEFAULTS.pollIntervalSec

  const updateCheckIntervalMin = typeof config.updateCheckIntervalMin === 'number'
    ? clamp(Math.round(config.updateCheckIntervalMin), MIN_UPDATE_CHECK_INTERVAL_MIN, MAX_UPDATE_CHECK_INTERVAL_MIN)
    : DEFAULTS.updateCheckIntervalMin

  return {
    repositories: Array.isArray(config.repositories) ? config.repositories : DEFAULTS.repositories,
    pollIntervalSec,
    autoUpdateEnabled: typeof config.autoUpdateEnabled === 'boolean' ? config.autoUpdateEnabled : DEFAULTS.autoUpdateEnabled,
    updateCheckIntervalMin,
    collapsedRepos: Array.isArray(config.collapsedRepos) ? config.collapsedRepos : DEFAULTS.collapsedRepos
  }
}

function configPath(): string {
  return CONFIG_PATH
}

function readConfigFile(filePath: string): AppConfig | null {
  try {
    const text = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(text) as Partial<AppConfig>
    return sanitizeConfig({ ...DEFAULTS, ...parsed })
  } catch {
    return null
  }
}

function readConfig(): AppConfig {
  return readConfigFile(configPath()) ?? { ...DEFAULTS }
}

function writeConfig(config: AppConfig): void {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true })
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2))
}

export function getConfig(): AppConfig {
  return readConfig()
}

export function setConfig(config: AppConfig): void {
  writeConfig(sanitizeConfig(config))
}

export function getCollapsedRepos(): string[] {
  return readConfig().collapsedRepos
}

export function setCollapsedRepos(ids: string[]): void {
  const config = readConfig()
  config.collapsedRepos = ids
  writeConfig(config)
}
