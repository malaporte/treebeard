import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { isValidIdeId } from '../../shared/ide-registry'
import type { AppConfig, Workspace, WorkspaceMember } from '../../shared/types'

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
const WORKSPACES_ROOT = path.join(os.homedir(), 'Developer', 'workspaces')

const DEFAULTS: AppConfig = {
  repositories: [],
  workspaces: [],
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

function isWorkspacePath(workspacePath: string): boolean {
  const relative = path.relative(WORKSPACES_ROOT, workspacePath)
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function isPathInside(parentPath: string, candidatePath: string): boolean {
  const relative = path.relative(parentPath, candidatePath)
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function sanitizeWorkspaceMember(member: unknown, workspacePath: string): WorkspaceMember | null {
  if (!member || typeof member !== 'object' || Array.isArray(member)) return null
  const candidate = member as Partial<WorkspaceMember>
  if (typeof candidate.repoId !== 'string' || !candidate.repoId) return null
  if (typeof candidate.worktreePath !== 'string' || !path.isAbsolute(candidate.worktreePath)) return null
  const linkPath = typeof candidate.linkPath === 'string' && isPathInside(workspacePath, candidate.linkPath)
    ? candidate.linkPath
    : isPathInside(workspacePath, candidate.worktreePath)
      ? candidate.worktreePath
      : null
  if (!linkPath) return null
  return { repoId: candidate.repoId, worktreePath: candidate.worktreePath, linkPath }
}

function sanitizeWorkspaces(workspaces: unknown): Workspace[] {
  if (!Array.isArray(workspaces)) return []

  const workspaceIds = new Set<string>()
  const workspacePaths = new Set<string>()
  const sanitized: Workspace[] = []

  for (const workspace of workspaces) {
    if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) continue
    const candidate = workspace as Partial<Workspace>
    if (typeof candidate.id !== 'string' || !candidate.id || workspaceIds.has(candidate.id)) continue
    if (typeof candidate.name !== 'string' || !candidate.name.trim()) continue
    if (typeof candidate.path !== 'string' || !isWorkspacePath(candidate.path) || workspacePaths.has(candidate.path)) continue

    const memberRepoIds = new Set<string>()
    const memberPaths = new Set<string>()
    const memberLinkPaths = new Set<string>()
    const members = (Array.isArray(candidate.members) ? candidate.members : [])
      .map((member) => sanitizeWorkspaceMember(member, candidate.path!))
      .filter((member): member is WorkspaceMember => {
        if (!member || memberRepoIds.has(member.repoId) || memberPaths.has(member.worktreePath) || memberLinkPaths.has(member.linkPath)) return false
        memberRepoIds.add(member.repoId)
        memberPaths.add(member.worktreePath)
        memberLinkPaths.add(member.linkPath)
        return true
      })

    workspaceIds.add(candidate.id)
    workspacePaths.add(candidate.path)
    sanitized.push({
      id: candidate.id,
      name: candidate.name.trim(),
      path: candidate.path,
      members
    })
  }

  return sanitized
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
    workspaces: sanitizeWorkspaces(config.workspaces),
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
