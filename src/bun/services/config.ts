import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import type { AppConfig, MobileBridgeConfig } from '../../shared/types'

const CONFIG_FILENAME = 'treebeard-config.json'
const MIN_POLL_INTERVAL_SEC = 10
const MAX_POLL_INTERVAL_SEC = 600
const MIN_UPDATE_CHECK_INTERVAL_MIN = 5
const MAX_UPDATE_CHECK_INTERVAL_MIN = 1440
const MIN_MOBILE_BRIDGE_PORT = 1024
const MAX_MOBILE_BRIDGE_PORT = 65535

const CONFIG_PATH = path.join(os.homedir(), '.config', 'treebeard')

const DEFAULTS: AppConfig = {
  repositories: [],
  pollIntervalSec: 60,
  autoUpdateEnabled: true,
  updateCheckIntervalMin: 30,
  collapsedRepos: [],
  opencodeServers: {},
  mobileBridge: {
    enabled: false,
    host: '0.0.0.0',
    port: 8787,
    pairingCode: ''
  }
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

  const mobileBridgeInput = config.mobileBridge
  const mobileBridge: MobileBridgeConfig = {
    enabled: typeof mobileBridgeInput?.enabled === 'boolean' ? mobileBridgeInput.enabled : DEFAULTS.mobileBridge.enabled,
    host: typeof mobileBridgeInput?.host === 'string' && mobileBridgeInput.host.trim().length > 0
      ? mobileBridgeInput.host.trim()
      : DEFAULTS.mobileBridge.host,
    port: typeof mobileBridgeInput?.port === 'number'
      ? clamp(Math.round(mobileBridgeInput.port), MIN_MOBILE_BRIDGE_PORT, MAX_MOBILE_BRIDGE_PORT)
      : DEFAULTS.mobileBridge.port,
    pairingCode: typeof mobileBridgeInput?.pairingCode === 'string' ? mobileBridgeInput.pairingCode.trim() : ''
  }

  return {
    repositories: Array.isArray(config.repositories) ? [...config.repositories] : [],
    pollIntervalSec,
    autoUpdateEnabled: typeof config.autoUpdateEnabled === 'boolean' ? config.autoUpdateEnabled : DEFAULTS.autoUpdateEnabled,
    updateCheckIntervalMin,
    collapsedRepos: Array.isArray(config.collapsedRepos) ? [...config.collapsedRepos] : [],
    opencodeServers: config.opencodeServers && typeof config.opencodeServers === 'object' && !Array.isArray(config.opencodeServers)
      ? { ...(config.opencodeServers as Record<string, boolean>) }
      : {},
    mobileBridge
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
  return readConfigFile(configPath()) ?? sanitizeConfig({})
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

export function getOpencodeEnabled(worktreePath: string): boolean {
  return readConfig().opencodeServers[worktreePath] === true
}

export function setOpencodeEnabled(worktreePath: string, enabled: boolean): void {
  const config = readConfig()
  if (enabled) {
    config.opencodeServers[worktreePath] = true
  } else {
    delete config.opencodeServers[worktreePath]
  }
  writeConfig(config)
}

export function getOpencodeEnabledPaths(): string[] {
  const servers = readConfig().opencodeServers
  return Object.keys(servers).filter((key) => servers[key])
}

export function getMobileBridgeConfig(): MobileBridgeConfig {
  return readConfig().mobileBridge
}

export function setMobileBridgeEnabled(enabled: boolean): MobileBridgeConfig {
  const config = readConfig()
  config.mobileBridge.enabled = enabled
  writeConfig(config)
  return config.mobileBridge
}

export function setMobileBridgeConfig(next: MobileBridgeConfig): MobileBridgeConfig {
  const config = readConfig()
  config.mobileBridge = {
    enabled: next.enabled,
    host: next.host,
    port: next.port,
    pairingCode: next.pairingCode
  }
  writeConfig(config)
  return config.mobileBridge
}

export function ensureMobileBridgePairingCode(): string {
  const config = readConfig()
  const existing = config.mobileBridge.pairingCode.trim()
  if (existing) return existing

  const pairingCode = generatePairingCode()
  config.mobileBridge.pairingCode = pairingCode
  writeConfig(config)
  return pairingCode
}

export function rotateMobileBridgePairingCode(): string {
  const config = readConfig()
  const pairingCode = generatePairingCode()
  config.mobileBridge.pairingCode = pairingCode
  writeConfig(config)
  return pairingCode
}

function generatePairingCode(): string {
  const value = Math.floor(100000 + Math.random() * 900000)
  return String(value)
}
