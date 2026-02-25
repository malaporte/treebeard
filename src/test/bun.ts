import { vi } from 'vitest'

interface SpawnResponse {
  stdout?: string
  stderr?: string
  exitCode?: number
}

function streamText(text: string): ReadableStream {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    }
  })
}

export function createSpawnProcess(response: SpawnResponse) {
  return {
    stdout: streamText(response.stdout ?? ''),
    stderr: streamText(response.stderr ?? ''),
    exited: Promise.resolve(response.exitCode ?? 0),
    kill: vi.fn()
  }
}

export function setBunSpawnQueue(responses: SpawnResponse[]) {
  const queue = [...responses]
  const spawn = vi.fn(() => {
    const next = queue.shift()
    if (!next) {
      return createSpawnProcess({ stderr: 'Unexpected spawn call', exitCode: 1 })
    }
    return createSpawnProcess(next)
  })

  vi.stubGlobal('Bun', {
    spawn,
    env: {
      HOME: '/Users/test',
      SHELL: '/bin/zsh'
    }
  })

  return spawn
}

export function setBunSpawnResolver(
  resolver: (command: string[]) => SpawnResponse
) {
  const spawn = vi.fn((command: string[]) => {
    return createSpawnProcess(resolver(command))
  })

  vi.stubGlobal('Bun', {
    spawn,
    env: {
      HOME: '/Users/test',
      SHELL: '/bin/zsh'
    }
  })

  return spawn
}
