/** Resolve the user's full login shell environment for subprocess spawning. */

let cachedEnv: Record<string, string> | null = null

/**
 * Get the user's login shell environment variables.
 * macOS GUI apps don't inherit the full shell PATH, so tools like gh and jira
 * installed in /opt/homebrew/bin won't be found. This resolves the real env
 * by spawning the user's login shell once and caching the result.
 */
export async function getShellEnv(): Promise<Record<string, string>> {
  if (cachedEnv) return cachedEnv

  try {
    const shell = Bun.env.SHELL || '/bin/zsh'
    const proc = Bun.spawn([shell, '-ilc', 'env -0'], {
      stdout: 'pipe',
      stderr: 'pipe'
    })

    const timer = setTimeout(() => proc.kill(), 5000)
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited
    clearTimeout(timer)

    if (exitCode !== 0) {
      cachedEnv = { ...process.env } as Record<string, string>
      return cachedEnv
    }

    const env: Record<string, string> = {}
    for (const entry of stdout.split('\0')) {
      const idx = entry.indexOf('=')
      if (idx > 0) {
        env[entry.slice(0, idx)] = entry.slice(idx + 1)
      }
    }

    cachedEnv = env
    return cachedEnv
  } catch {
    cachedEnv = { ...process.env } as Record<string, string>
    return cachedEnv
  }
}
