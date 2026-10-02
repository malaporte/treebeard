import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureClaudeSessionTitle, findLatestClaudeSession, launchClaudeDesktop, launchGhostty, launchIde, launchPippinShell } from './launcher'
import { setBunSpawnQueue } from '../../test/bun'

vi.mock('./shell-env', () => ({
  getShellEnv: vi.fn(async () => ({ PATH: '/usr/bin' }))
}))

describe('launcher service', () => {
  it('launches the configured IDE and waits for exit', async () => {
    const spawn = setBunSpawnQueue([{ stdout: '' }])

    await launchIde('vscode', '/repo/worktree')

    expect(spawn).toHaveBeenCalledWith(
      ['code', '/repo/worktree'],
      expect.objectContaining({ stdout: 'pipe', stderr: 'pipe' })
    )
  })

  it('launches IntelliJ via the idea CLI command', async () => {
    const spawn = setBunSpawnQueue([{ stdout: '' }])

    await launchIde('intellij', '/repo/worktree')

    expect(spawn).toHaveBeenCalledWith(
      ['idea', '/repo/worktree'],
      expect.objectContaining({ stdout: 'pipe', stderr: 'pipe' })
    )
  })

  it('launches ghostty with AppleScript and sets tab title', async () => {
    const spawn = setBunSpawnQueue([{ stdout: '' }])

    await launchGhostty('/Users/user/projects/node-commons/this-is-the-worktree')

    expect(spawn).toHaveBeenCalledWith(
      ['/usr/bin/osascript', '-e', expect.stringContaining('tell application "Ghostty"')],
      expect.objectContaining({ stdout: 'ignore', stderr: 'ignore' })
    )
  })

  it('launches a Ghostty tab running pippin shell in the worktree', async () => {
    const spawn = setBunSpawnQueue([{ stdout: '/opt/homebrew/bin/pippin\n' }, { stdout: '' }])

    await launchPippinShell('/repo/worktree')

    expect(spawn).toHaveBeenCalledWith(
      ['which', 'pippin'],
      expect.objectContaining({ stdout: 'pipe', stderr: 'ignore', env: { PATH: '/usr/bin' } })
    )
    expect(spawn).toHaveBeenCalledWith(
      ['/usr/bin/osascript', '-e', expect.stringContaining('set command of cfg to "/opt/homebrew/bin/pippin shell"')],
      expect.objectContaining({ stdout: 'ignore', stderr: 'ignore' })
    )
    expect(spawn).toHaveBeenCalledWith(
      ['/usr/bin/osascript', '-e', expect.stringContaining('set environment variables of cfg to {"PATH=/usr/bin"}')],
      expect.objectContaining({ stdout: 'ignore', stderr: 'ignore' })
    )
    expect(spawn).toHaveBeenCalledWith(
      ['/usr/bin/osascript', '-e', expect.stringContaining('set initial working directory of cfg to "/repo/worktree"')],
      expect.objectContaining({ stdout: 'ignore', stderr: 'ignore' })
    )
  })

  describe('Claude Desktop', () => {
    const SESSION_A = '11111111-1111-1111-1111-111111111111'
    const SESSION_B = '22222222-2222-2222-2222-222222222222'
    let configDir: string

    const writeSession = (worktreePath: string, name: string, mtime: number, content = '{}\n') => {
      const projectDir = path.join(configDir, 'projects', worktreePath.replace(/[^a-zA-Z0-9]/g, '-'))
      fs.mkdirSync(projectDir, { recursive: true })
      const file = path.join(projectDir, name)
      fs.writeFileSync(file, content)
      fs.utimesSync(file, mtime, mtime)
      return file
    }

    beforeEach(() => {
      configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'treebeard-claude-'))
      vi.stubEnv('CLAUDE_CONFIG_DIR', configDir)
    })

    afterEach(() => {
      vi.unstubAllEnvs()
      fs.rmSync(configDir, { recursive: true, force: true })
    })

    it('finds the most recently modified session for the folder', () => {
      writeSession('/repo/my_worktree.v2', `${SESSION_A}.jsonl`, 1000)
      writeSession('/repo/my_worktree.v2', `${SESSION_B}.jsonl`, 2000)
      writeSession('/repo/my_worktree.v2', 'not-a-session.jsonl', 3000)

      expect(findLatestClaudeSession('/repo/my_worktree.v2')?.id).toBe(SESSION_B)
    })

    it('returns null when the folder has no sessions', () => {
      expect(findLatestClaudeSession('/repo/unknown')).toBeNull()
    })

    it('names an untitled session after the worktree', () => {
      const file = writeSession('/repo/feat-x', `${SESSION_A}.jsonl`, 1000)

      ensureClaudeSessionTitle({ id: SESSION_A, file }, 'feat-x')

      const lines = fs.readFileSync(file, 'utf-8').trim().split('\n')
      expect(JSON.parse(lines[lines.length - 1])).toEqual({ type: 'custom-title', customTitle: 'feat-x', sessionId: SESSION_A })
    })

    it('keeps a title the user already set', () => {
      const content = `{"type":"custom-title","customTitle":"my name","sessionId":"${SESSION_A}"}\n`
      const file = writeSession('/repo/feat-x', `${SESSION_A}.jsonl`, 1000, content)

      ensureClaudeSessionTitle({ id: SESSION_A, file }, 'feat-x')

      expect(fs.readFileSync(file, 'utf-8')).toBe(content)
    })

    it('resumes the latest session via deep link', async () => {
      writeSession('/repo/worktree', `${SESSION_A}.jsonl`, 1000)
      const spawn = setBunSpawnQueue([{ stdout: '' }])

      await launchClaudeDesktop('/repo/worktree')

      expect(spawn).toHaveBeenCalledWith(
        ['/usr/bin/open', `claude://resume?session=${SESSION_A}`],
        expect.objectContaining({ stdout: 'ignore', stderr: 'ignore' })
      )
    })

    it('creates a session named after the worktree when none exists', async () => {
      const spawn = setBunSpawnQueue([{ stdout: '/usr/local/bin/claude\n' }, { stdout: '' }, { stdout: '' }])

      await launchClaudeDesktop('/repo/feat-x')

      const createCall = spawn.mock.calls[1] as unknown as [string[], { cwd: string }]
      const [command, options] = createCall
      expect(command.slice(0, 3)).toEqual(['/usr/local/bin/claude', '-p', '--session-id'])
      expect(command[4]).toBe('/rename feat-x')
      expect(options.cwd).toBe('/repo/feat-x')
      expect(spawn).toHaveBeenLastCalledWith(
        ['/usr/bin/open', `claude://resume?session=${command[3]}`],
        expect.objectContaining({ stdout: 'ignore', stderr: 'ignore' })
      )
    })

    it('opens the folder for an untitled session when the claude CLI is missing', async () => {
      const spawn = setBunSpawnQueue([{ stdout: '' }, { stdout: '' }])

      await launchClaudeDesktop('/repo/worktree')

      expect(spawn).toHaveBeenLastCalledWith(
        ['/usr/bin/open', '-a', 'Claude', '/repo/worktree'],
        expect.objectContaining({ stdout: 'ignore', stderr: 'ignore' })
      )
    })
  })
})
