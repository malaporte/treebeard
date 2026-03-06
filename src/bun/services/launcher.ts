import { getShellEnv } from './shell-env'

interface CodexRpcResponse {
  id?: unknown
  result?: unknown
  error?: unknown
}

interface CodexThreadListItem {
  id?: unknown
}

interface CodexThreadListResponse {
  data?: unknown
}

export async function launchVSCode(worktreePath: string): Promise<void> {
  const env = await getShellEnv()
  const proc = Bun.spawn(['code', worktreePath], { stdout: 'pipe', stderr: 'pipe', env })
  await proc.exited
}

export async function launchGhostty(worktreePath: string): Promise<void> {
  // Pass the path as a file argument so open(1) forwards it to the running
  // instance via application:openFile:, which Ghostty maps to a new tab/window
  // in the correct directory without spawning a second process.
  const env = await getShellEnv()
  Bun.spawn(['open', '-a', 'Ghostty.app', worktreePath], {
    stdout: 'ignore',
    stderr: 'ignore',
    env
  })
}

export async function launchCodexDesktop(worktreePath: string): Promise<void> {
  const latestThreadId = await findLatestCodexThreadId(worktreePath)
  if (latestThreadId) {
    await launchURL(`codex://threads/${latestThreadId}`)
    return
  }

  const env = await getShellEnv()
  const proc = Bun.spawn(['open', '-a', 'Codex.app', worktreePath], {
    stdout: 'pipe',
    stderr: 'pipe',
    env
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error('Failed to launch Codex desktop app')
  }
}

export async function launchURL(url: string): Promise<void> {
  const proc = Bun.spawn(['/usr/bin/open', url], {
    stdout: 'pipe',
    stderr: 'pipe'
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error('Failed to open URL')
  }
}

async function findLatestCodexThreadId(worktreePath: string): Promise<string | null> {
  const env = await getShellEnv()
  const proc = Bun.spawn(['codex', 'app-server', '--listen', 'stdio://'], {
    cwd: worktreePath,
    env,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe'
  })

  const sink = proc.stdin as { write?: (data: string) => void } | undefined
  if (!sink?.write || !(proc.stdout instanceof ReadableStream)) {
    try {
      proc.kill()
    } catch {
      // Best-effort cleanup.
    }
    return null
  }

  const timeout = setTimeout(() => {
    try {
      proc.kill()
    } catch {
      // Best-effort cleanup.
    }
  }, 5000)

  try {
    sink.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        clientInfo: { name: 'treebeard', version: '1.0.0' },
        capabilities: { experimentalApi: true }
      }
    })}\n`)
    sink.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized' })}\n`)
    sink.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'thread/list',
      params: {
        cwd: worktreePath,
        limit: 1,
        sortKey: 'updated_at',
        archived: false
      }
    })}\n`)

    const threadId = await readLatestThreadIdFromStream(proc.stdout)
    return threadId
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
    try {
      proc.kill()
    } catch {
      // Best-effort cleanup.
    }
    await proc.exited
  }
}

async function readLatestThreadIdFromStream(stream: ReadableStream<Uint8Array>): Promise<string | null> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let pending = ''

  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break

      pending += decoder.decode(result.value, { stream: true })
      const lines = pending.split('\n')
      pending = lines.pop() || ''

      for (const line of lines) {
        const threadId = getLatestThreadIdFromLine(line)
        if (threadId) return threadId
      }
    }

    return getLatestThreadIdFromLine(pending)
  } finally {
    reader.releaseLock()
  }
}

function getLatestThreadIdFromLine(line: string): string | null {
  const trimmed = line.trim()
  if (trimmed.length === 0) return null

  const parsed = safeJson(trimmed)
  if (!parsed || typeof parsed !== 'object') return null

  const response = parsed as CodexRpcResponse
  if (response.id !== 2 || response.error !== undefined) return null
  const result = response.result as CodexThreadListResponse | undefined
  if (!Array.isArray(result?.data) || result.data.length === 0) return null

  const firstThread = result.data[0] as CodexThreadListItem | undefined
  return typeof firstThread?.id === 'string' && firstThread.id.length > 0
    ? firstThread.id
    : null
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
