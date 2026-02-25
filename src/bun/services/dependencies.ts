import { getShellEnv } from './shell-env'
import type { DependencyCheck, DependencyStatus } from '../../shared/types'

const COMMAND_TIMEOUT_MS = 5000

interface CommandResult {
  ok: boolean
  output: string
  error: string | null
}

async function runCommand(
  name: 'gh' | 'jira',
  args: string[],
  env: Record<string, string>
): Promise<CommandResult> {
  try {
    const proc = Bun.spawn([name, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
      env
    })

    const timer = setTimeout(() => proc.kill(), COMMAND_TIMEOUT_MS)
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ])
    clearTimeout(timer)

    const output = stdout.trim() || stderr.trim()
    if (exitCode === 0) {
      return { ok: true, output, error: null }
    }

    return { ok: false, output, error: output || `Exited with code ${exitCode}` }
  } catch (err) {
    return {
      ok: false,
      output: '',
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

async function checkCommand(
  name: 'gh' | 'jira',
  probes: string[][],
  env: Record<string, string>
): Promise<{ installed: boolean; version: string | null; error: string | null }> {
  let lastError: string | null = null

  for (const args of probes) {
    const result = await runCommand(name, args, env)
    if (result.ok) {
      return {
        installed: true,
        version: result.output ? result.output.split('\n')[0] : null,
        error: null
      }
    }

    lastError = result.error
  }

  return {
    installed: false,
    version: null,
    error: lastError || 'Not found in PATH'
  }
}

function isUnsupportedCommandError(error: string | null): boolean {
  if (!error) return false
  const normalized = error.toLowerCase()
  return normalized.includes('unknown command') || normalized.includes('unknown shorthand flag')
}

async function checkAuth(
  name: 'gh' | 'jira',
  probes: string[][],
  env: Record<string, string>
): Promise<{ authenticated: boolean | null; authError: string | null }> {
  let lastError: string | null = null

  for (const args of probes) {
    const result = await runCommand(name, args, env)
    if (result.ok) {
      return { authenticated: true, authError: null }
    }

    if (isUnsupportedCommandError(result.error)) {
      return { authenticated: null, authError: null }
    }

    lastError = result.error
  }

  return {
    authenticated: false,
    authError: lastError || 'Authentication check failed'
  }
}

async function checkDependency(name: 'gh' | 'jira', env: Record<string, string>): Promise<DependencyCheck> {
  const commandProbes = name === 'gh' ? [['--version']] : [['--version'], ['version']]
  const commandStatus = await checkCommand(name, commandProbes, env)

  if (!commandStatus.installed) {
    return {
      name,
      required: true,
      installed: false,
      authenticated: null,
      version: null,
      error: commandStatus.error,
      authError: null
    }
  }

  const authProbes = name === 'gh'
    ? [['auth', 'status']]
    : [['me', '--raw'], ['me']]
  const authStatus = await checkAuth(name, authProbes, env)

  return {
    name,
    required: true,
    installed: true,
    authenticated: authStatus.authenticated,
    version: commandStatus.version,
    error: null,
    authError: authStatus.authError
  }
}

/** Check required command-line dependencies used by Treebeard integrations. */
export async function checkDependencies(): Promise<DependencyStatus> {
  const env = await getShellEnv()
  const checks = await Promise.all([
    checkDependency('gh', env),
    checkDependency('jira', env)
  ])

  return {
    checkedAt: new Date().toISOString(),
    checks
  }
}
