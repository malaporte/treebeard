import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import type { Browser, Page, Request as PlaywrightRequest } from 'playwright'

const DEFAULT_WORKTREE = '/Users/martin/Developer/node-commons'
const outputDir = path.resolve(process.env.UI_SMOKE_OUTPUT_DIR || 'tmp/ui-smoke')
const worktreePath = process.argv[2] || process.env.UI_SMOKE_WORKTREE || DEFAULT_WORKTREE
const headed = process.env.UI_SMOKE_HEADED === '1'
const timeoutMs = Number(process.env.UI_SMOKE_TIMEOUT_MS || '60000')
const requireAssistantResponse = process.env.UI_SMOKE_REQUIRE_ASSISTANT === '1'
const promptOverride = process.env.UI_SMOKE_PROMPT

interface ArtifactSummary {
  url: string
  finalPageUrl: string | null
  worktreePath: string
  startedAt: string
  requireAssistantResponse: boolean
  promptRequestSeen: boolean
  sessionId: string | null
  assistantResponseSeen: boolean
  assistantDomSeen: boolean
  assistantSnippet: string | null
  lastMessageRoles: string[]
  lastMessagePartTypes: string[]
  errors: string[]
  consoleErrors: string[]
  errorResponses: string[]
  failedRequests: string[]
  proxyTracePath: string
}

function resetOutputDir(): void {
  fs.rmSync(outputDir, { recursive: true, force: true })
  fs.mkdirSync(outputDir, { recursive: true })
}

function writeTextArtifact(fileName: string, value: string): void {
  fs.writeFileSync(path.join(outputDir, fileName), value)
}

function runUrlCommand(targetWorktree: string): string {
  const proc = Bun.spawnSync(['pnpm', '-s', 'ui:opencode:url', targetWorktree], {
    stdout: 'pipe',
    stderr: 'pipe'
  })

  const stdout = proc.stdout ? new TextDecoder().decode(proc.stdout).trim() : ''
  const stderr = proc.stderr ? new TextDecoder().decode(proc.stderr).trim() : ''

  writeTextArtifact('url-command.stdout.log', stdout)
  writeTextArtifact('url-command.stderr.log', stderr)

  if (proc.exitCode !== 0) {
    throw new Error(`Failed to generate OpenCode URL (exit ${proc.exitCode})`)
  }

  const url = stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('http://') || line.startsWith('https://'))

  if (!url) {
    throw new Error('OpenCode URL was not found in command output')
  }

  return url
}

async function run(): Promise<void> {
  resetOutputDir()

  const summary: ArtifactSummary = {
    url: '',
    finalPageUrl: null,
    worktreePath,
    startedAt: new Date().toISOString(),
    requireAssistantResponse,
    promptRequestSeen: false,
    sessionId: null,
    assistantResponseSeen: false,
    assistantDomSeen: false,
    assistantSnippet: null,
    lastMessageRoles: [],
    lastMessagePartTypes: [],
    errors: [],
    consoleErrors: [],
    errorResponses: [],
    failedRequests: [],
    proxyTracePath: '/Users/martin/.config/treebeard-mobile-proxy-trace.log'
  }

  const promptText = promptOverride || `Reply with exactly ACK and no other words. id=${Date.now()}`
  writeTextArtifact('prompt.txt', `${promptText}\n`)

  let browser: Browser | null = null
  let page: Page | null = null

  try {
    const url = runUrlCommand(worktreePath)
    summary.url = url
    writeTextArtifact('session-url.txt', `${url}\n`)

    browser = await chromium.launch({ headless: !headed })
    const context = await browser.newContext()
    page = await context.newPage()

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        summary.consoleErrors.push(`[console] ${msg.text()}`)
      }
    })

    page.on('requestfailed', (request) => {
      summary.failedRequests.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'failed'}`)
    })

    page.on('response', (response) => {
      if (response.status() >= 400) {
        summary.errorResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`)
      }
    })

    await page.goto(url, { waitUntil: 'load', timeout: timeoutMs })
    await page.waitForTimeout(1500)
    writeTextArtifact('page.html', await page.content())

    const promptRequestPromise: Promise<PlaywrightRequest> = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().includes('/prompt_async'),
      { timeout: timeoutMs }
    )

    let textbox = page.getByRole('textbox', { name: /ask anything/i }).first()
    let hasTextbox = await textbox.isVisible({ timeout: 15000 }).catch(() => false)

    if (!hasTextbox) {
      await page.reload({ waitUntil: 'load', timeout: timeoutMs })
      await page.waitForTimeout(1500)
      writeTextArtifact('page-reload.html', await page.content())
      textbox = page.getByRole('textbox', { name: /ask anything/i }).first()
      hasTextbox = await textbox.isVisible({ timeout: 10000 }).catch(() => false)
    }

    if (hasTextbox) {
      await textbox.fill(promptText)
      await page.keyboard.press('Enter')
    } else {
      const fallback = page.locator('textarea, [contenteditable="true"]').first()
      if (!await fallback.isVisible({ timeout: 5000 }).catch(() => false)) {
        throw new Error('Could not locate a visible message composer')
      }

      if (await fallback.evaluate((el) => el.getAttribute('contenteditable') === 'true')) {
        await fallback.click()
        await page.keyboard.type(promptText)
      } else {
        await fallback.fill(promptText)
      }

      await page.keyboard.press('Enter')
    }

    const promptRequest = await promptRequestPromise
    summary.promptRequestSeen = true

    const promptUrl = promptRequest.url()
    const sessionMatch = promptUrl.match(/\/session\/([^/]+)\/prompt_async/)
    if (sessionMatch) {
      summary.sessionId = sessionMatch[1]
    }

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline && !summary.assistantResponseSeen) {
      if (summary.sessionId) {
        const result = await page.evaluate(async ({ sessionId }) => {
          const response = await fetch(`/session/${sessionId}/message?limit=400`, {
            credentials: 'include'
          })
          if (!response.ok) {
            return {
              ok: false,
              assistant: false,
              count: -1,
              roles: [] as string[],
              partTypes: [] as string[],
              assistantText: null as string | null
            }
          }

          const body = await response.json() as Array<Record<string, unknown>>
          const messages = Array.isArray(body) ? body : []
          const roles = messages.map(extractRole)
          const partTypes = messages.flatMap(extractPartTypes)
          const assistantText = messages
            .filter((item) => extractRole(item) === 'assistant')
            .flatMap((item) => extractPartTexts(item))
            .find((text) => text.length > 0) || null
          const assistant = roles.some((role) => role === 'assistant')
          return {
            ok: true,
            assistant,
            count: messages.length,
            roles,
            partTypes,
            assistantText
          }

          function extractRole(item: Record<string, unknown>): string {
            const direct = item.role
            if (typeof direct === 'string') {
              return direct
            }

            const info = item.info
            if (info && typeof info === 'object') {
              const nested = (info as { role?: unknown }).role
              if (typeof nested === 'string') {
                return nested
              }
            }

            return 'unknown'
          }

          function extractPartTypes(item: Record<string, unknown>): string[] {
            const parts = item.parts
            if (!Array.isArray(parts)) {
              return []
            }

            return parts
              .map((part) => {
                if (!part || typeof part !== 'object') {
                  return ''
                }

                const type = (part as { type?: unknown }).type
                return typeof type === 'string' ? type : ''
              })
              .filter((type) => type.length > 0)
          }

          function extractPartTexts(item: Record<string, unknown>): string[] {
            const parts = item.parts
            if (!Array.isArray(parts)) {
              return []
            }

            return parts
              .map((part) => {
                if (!part || typeof part !== 'object') {
                  return ''
                }

                const text = (part as { text?: unknown }).text
                return typeof text === 'string' ? text : ''
              })
              .filter((text) => text.length > 0)
          }
        }, { sessionId: summary.sessionId })

        summary.lastMessageRoles = result.roles
        summary.lastMessagePartTypes = result.partTypes
        summary.assistantSnippet = result.assistantText ? result.assistantText.trim().slice(0, 80) : null

        if (result.ok && result.assistant && result.assistantText) {
          summary.assistantResponseSeen = true
          const domDeadline = Date.now() + 20000

          while (Date.now() < domDeadline && !summary.assistantDomSeen) {
            const domContainsAssistant = await page.evaluate((assistantText) => {
              function collectText(root: ParentNode): string {
                const chunks: string[] = []
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)

                while (walker.nextNode()) {
                  const current = walker.currentNode
                  if (current.nodeType === Node.TEXT_NODE) {
                    const text = current.textContent?.trim() || ''
                    if (text) {
                      chunks.push(text)
                    }
                    continue
                  }

                  const element = current as Element
                  if (element.shadowRoot) {
                    chunks.push(collectText(element.shadowRoot))
                  }
                }

                return chunks.join('\n')
              }

              const text = collectText(document)
              return text.includes(assistantText)
            }, result.assistantText)

            summary.assistantDomSeen = domContainsAssistant
            if (!summary.assistantDomSeen) {
              await page.waitForTimeout(1000)
            }
          }

          break
        }
      }

      await page.waitForTimeout(1500)
    }

    await page.screenshot({ path: path.join(outputDir, 'final.png'), fullPage: true })
    summary.finalPageUrl = page.url()
    writeTextArtifact('page-after.html', await page.content())
    writeTextArtifact('page-after.text.txt', await page.evaluate(() => {
      function collectText(root: ParentNode): string {
        const chunks: string[] = []
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)

        while (walker.nextNode()) {
          const current = walker.currentNode
          if (current.nodeType === Node.TEXT_NODE) {
            const text = current.textContent?.trim() || ''
            if (text) {
              chunks.push(text)
            }
            continue
          }

          const element = current as Element
          if (element.shadowRoot) {
            chunks.push(collectText(element.shadowRoot))
          }
        }

        return chunks.join('\n')
      }

      return collectText(document)
    }))

    if (requireAssistantResponse && !summary.assistantResponseSeen) {
      throw new Error('No assistant message payload observed after prompt request')
    }

    if (requireAssistantResponse && summary.assistantResponseSeen && !summary.assistantDomSeen) {
      throw new Error('Assistant reply reached message payload but was not visible in DOM text')
    }
  } catch (err) {
    summary.errors.push(err instanceof Error ? err.message : String(err))
    if (page) {
      await page.screenshot({ path: path.join(outputDir, 'failure.png'), fullPage: true }).catch(() => undefined)
    }
  } finally {
    if (browser) {
      await browser.close()
    }

    writeTextArtifact('summary.json', `${JSON.stringify(summary, null, 2)}\n`)
  }

  if (!summary.promptRequestSeen || (requireAssistantResponse && (!summary.assistantResponseSeen || !summary.assistantDomSeen)) || summary.errors.length > 0) {
    process.stderr.write(`Smoke failed. Artifacts: ${outputDir}\n`)
    process.exit(1)
  }

  process.stdout.write(`Smoke passed. Artifacts: ${outputDir}\n`)
}

await run()
