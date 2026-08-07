import path from 'node:path'
import { getConfig, setConfig } from './config'
import { getShellEnv } from './shell-env'

interface KiroCrewToken {
  origin: string
  token: string
}

interface KiroCrewSlot {
  key: string
}

interface KiroCrewResult {
  success: boolean
  error?: string
}

type SlotLookupResult = 'exists' | 'missing' | 'failed'

function apiURL(origin: string, token: string, endpoint: string): string {
  const url = new URL(endpoint, origin)
  url.searchParams.set('token', token)
  return url.toString()
}

function parseKiroCrewToken(output: string): KiroCrewToken | null {
  const match = output.match(/https?:\/\/[^\s]+/)
  if (!match) return null

  try {
    const url = new URL(match[0])
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return null

    const token = url.searchParams.get('token')
    if (!token) return null

    return { origin: url.origin, token }
  } catch {
    return null
  }
}

async function getKiroCrewToken(): Promise<KiroCrewToken | null> {
  try {
    const env = await getShellEnv()
    const proc = Bun.spawn(['kirocrew', 'token'], { stdout: 'pipe', stderr: 'ignore', env })
    const output = await new Response(proc.stdout).text()
    const exitCode = await proc.exited
    if (exitCode !== 0) return null
    return parseKiroCrewToken(output)
  } catch {
    return null
  }
}

/** Check whether the Kiro Crew CLI and desktop app are both installed */
export async function isKiroCrewAvailable(): Promise<boolean> {
  try {
    const env = await getShellEnv()
    const cliProc = Bun.spawn(['which', 'kirocrew'], { stdout: 'pipe', stderr: 'ignore', env })
    const appProc = Bun.spawn(
      ['/usr/bin/mdfind', 'kMDItemCFBundleIdentifier == "com.amazon.kiro.crew*"cd'],
      { stdout: 'pipe', stderr: 'ignore' }
    )
    const [cliPath, appPath, cliExitCode, appExitCode] = await Promise.all([
      new Response(cliProc.stdout).text(),
      new Response(appProc.stdout).text(),
      cliProc.exited,
      appProc.exited
    ])

    return cliExitCode === 0 && appExitCode === 0 && Boolean(cliPath.trim()) && Boolean(appPath.trim())
  } catch {
    return false
  }
}

async function getSlotLookupResult(token: KiroCrewToken, slotKey: string): Promise<SlotLookupResult> {
  try {
    const response = await fetch(apiURL(token.origin, token.token, `/api/chat/slots/${encodeURIComponent(slotKey)}`))
    if (response.ok) return 'exists'
    return response.status === 404 ? 'missing' : 'failed'
  } catch {
    return 'failed'
  }
}

function getWorktreeTitle(worktreePath: string): string {
  const worktreeName = path.basename(worktreePath)
  const projectName = path.basename(path.dirname(worktreePath))
  return `Treebeard: ${projectName} / ${worktreeName}`
}

async function createSlot(token: KiroCrewToken, title: string): Promise<string | null> {
  try {
    const response = await fetch(apiURL(token.origin, token.token, '/api/chat/slots'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    })
    if (!response.ok) return null

    const slot = await response.json() as KiroCrewSlot
    return typeof slot.key === 'string' && slot.key.length > 0 ? slot.key : null
  } catch {
    return null
  }
}

async function setSlotProject(token: KiroCrewToken, slotKey: string, worktreePath: string): Promise<boolean> {
  try {
    const response = await fetch(
      apiURL(token.origin, token.token, `/api/chat/slots/${encodeURIComponent(slotKey)}/project`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: worktreePath })
      }
    )
    return response.ok
  } catch {
    return false
  }
}

async function focusKiroCrew(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['/usr/bin/open', '-a', 'KiroCrew'], { stdout: 'ignore', stderr: 'ignore' })
    return (await proc.exited) === 0
  } catch {
    return false
  }
}

/** Create or reuse a Kiro Crew session scoped to a worktree and focus its desktop app */
export async function openKiroCrewSession(worktreePath: string): Promise<KiroCrewResult> {
  const token = await getKiroCrewToken()
  if (!token) {
    return { success: false, error: 'Kiro Crew is unavailable. Start its gateway and try again.' }
  }

  const normalizedPath = path.resolve(worktreePath)
  const config = getConfig()
  let slotKey: string | undefined = config.kiroCrewSessions[normalizedPath]

  if (slotKey) {
    const lookupResult = await getSlotLookupResult(token, slotKey)
    if (lookupResult === 'failed') {
      return { success: false, error: 'Kiro Crew could not open its saved session.' }
    }
    if (lookupResult === 'missing') {
      slotKey = undefined
    }
  }

  if (!slotKey) {
    const createdSlotKey = await createSlot(token, getWorktreeTitle(normalizedPath))
    if (!createdSlotKey) {
      return { success: false, error: 'Kiro Crew could not create a session.' }
    }
    slotKey = createdSlotKey
  }

  if (!(await setSlotProject(token, slotKey, normalizedPath))) {
    return { success: false, error: 'Kiro Crew could not use this worktree.' }
  }

  if (config.kiroCrewSessions[normalizedPath] !== slotKey) {
    setConfig({
      ...config,
      kiroCrewSessions: {
        ...config.kiroCrewSessions,
        [normalizedPath]: slotKey
      }
    })
  }

  if (!(await focusKiroCrew())) {
    return { success: false, error: 'Kiro Crew session is ready, but its desktop app could not be opened.' }
  }

  return { success: true }
}
