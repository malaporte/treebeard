import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { isValidIdeId } from '../../shared/ide-registry'
import type { AppConfig } from '../../shared/types'

const CONFIG_FILENAME = 'treebeard-config.json'
const MIN_POLL_INTERVAL_SEC = 10
const MAX_POLL_INTERVAL_SEC = 600
const MIN_FETCH_INTERVAL_SEC = 60
const MAX_FETCH_INTERVAL_SEC = 3600
const MIN_UPDATE_CHECK_INTERVAL_MIN = 5
const MAX_UPDATE_CHECK_INTERVAL_MIN = 1440
const MIN_JIRA_PANEL_WIDTH = 180
const MAX_JIRA_PANEL_WIDTH = 600

const CONFIG_PATH = path.join(os.homedir(), '.config', 'treebeard', CONFIG_FILENAME)

const DEFAULTS: AppConfig = {
  repositories: [],
  kiroCrewSessions: {},
  pollIntervalSec: 60,
  fetchIntervalSec: 300,
  autoUpdateEnabled: true,
  updateCheckIntervalMin: 30,
  collapsedRepos: [],
  defaultIde: 'vscode',
  jiraPanelOpen: false,
  jiraPanelWidth: 260
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function sanitizeKiroCrewSessions(sessions: unknown): Record<string, string> {
  if (!sessions || typeof sessions !== 'object' || Array.isArray(sessions)) return {}

  return Object.fromEntries(
    Object.entries(sessions).filter(([worktreePath, slotKey]) =>
      worktreePath.length > 0 && typeof slotKey === 'string' && slotKey.length > 0
    )
  )
}

function sanitizeConfig(config: Partial<AppConfig>): AppConfig {
  const pollIntervalSec = typeof config.pollIntervalSec === 'number'
    ? clamp(Math.round(config.pollIntervalSec), MIN_POLL_INTERVAL_SEC, MAX_POLL_INTERVAL_SEC)
    : DEFAULTS.pollIntervalSec

  const fetchIntervalSec = typeof config.fetchIntervalSec === 'number'
    ? clamp(Math.round(config.fetchIntervalSec), MIN_FETCH_INTERVAL_SEC, MAX_FETCH_INTERVAL_SEC)
    : DEFAULTS.fetchIntervalSec

  const updateCheckIntervalMin = typeof config.updateCheckIntervalMin === 'number'
    ? clamp(Math.round(config.updateCheckIntervalMin), MIN_UPDATE_CHECK_INTERVAL_MIN, MAX_UPDATE_CHECK_INTERVAL_MIN)
    : DEFAULTS.updateCheckIntervalMin

  return {
    repositories: Array.isArray(config.repositories) ? [...config.repositories] : [],
    kiroCrewSessions: sanitizeKiroCrewSessions(config.kiroCrewSessions),
    pollIntervalSec,
    fetchIntervalSec,
    autoUpdateEnabled: typeof config.autoUpdateEnabled === 'boolean' ? config.autoUpdateEnabled : DEFAULTS.autoUpdateEnabled,
    updateCheckIntervalMin,
    collapsedRepos: Array.isArray(config.collapsedRepos) ? [...config.collapsedRepos] : [],
    defaultIde: isValidIdeId(config.defaultIde) ? config.defaultIde : DEFAULTS.defaultIde,
    jiraPanelOpen: typeof config.jiraPanelOpen === 'boolean' ? config.jiraPanelOpen : DEFAULTS.jiraPanelOpen,
    jiraPanelWidth: typeof config.jiraPanelWidth === 'number'
      ? clamp(Math.round(config.jiraPanelWidth), MIN_JIRA_PANEL_WIDTH, MAX_JIRA_PANEL_WIDTH)
      : DEFAULTS.jiraPanelWidth
  }
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
  return readConfigFile(CONFIG_PATH) ?? sanitizeConfig({})
}

function writeConfig(config: AppConfig): void {
  const serialized = JSON.stringify(config, null, 2)
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
    fs.writeFileSync(CONFIG_PATH, serialized)
  } catch (err) {
    // New schema stores config at ~/.config/treebeard/treebeard-config.json.
    // If ~/.config/treebeard exists as a file, move it aside and retry.
    if (!(err && typeof err === 'object' && 'code' in err && err.code === 'EEXIST')) {
      throw err
    }

    const configDir = path.dirname(CONFIG_PATH)
    const backupPath = `${configDir}.legacy-${Date.now()}.bak`
    fs.renameSync(configDir, backupPath)
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(CONFIG_PATH, serialized)
  }
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
