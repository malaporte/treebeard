import { useState, useEffect, useRef, useCallback } from 'react'
import type { JiraIssueDragData } from '../components/JiraIssueCard'

interface JiraDragState {
  data: JiraIssueDragData
  x: number
  y: number
}

interface UseJiraDragResult {
  isDragging: boolean
  draggingKey: string | null
  overRepoId: string | null
  onMouseDown: (e: React.MouseEvent, data: JiraIssueDragData) => void
}

/** Find the nearest ancestor (or self) with data-repo-id at the given document coordinates. */
function repoIdAtPoint(x: number, y: number): string | null {
  const els = document.elementsFromPoint(x, y)
  for (const el of els) {
    const id = (el as HTMLElement).dataset?.repoId
    if (id) return id
  }
  return null
}

export function useJiraDrag(
  onDrop: (repoId: string, data: JiraIssueDragData) => void
): UseJiraDragResult {
  const [drag, setDrag] = useState<JiraDragState | null>(null)
  const [overRepoId, setOverRepoId] = useState<string | null>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)

  const onMouseDown = useCallback((e: React.MouseEvent, data: JiraIssueDragData) => {
    e.preventDefault()
    setDrag({ data, x: e.clientX, y: e.clientY })
    setOverRepoId(null)
  }, [])

  useEffect(() => {
    if (!drag) return

    // Create ghost element
    const ghost = document.createElement('div')
    ghost.style.cssText = `
      position: fixed;
      left: ${drag.x + 12}px;
      top: ${drag.y - 16}px;
      padding: 5px 10px;
      border-radius: 6px;
      background: var(--mantine-color-dark-6, #1a1b1e);
      border: 1px solid rgba(0,136,255,0.5);
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      font-size: 12px;
      font-family: monospace;
      color: var(--mantine-color-gray-3, #dee2e6);
      pointer-events: none;
      z-index: 9999;
      white-space: nowrap;
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
    `
    const summary = drag.data.issueSummary.length > 40
      ? drag.data.issueSummary.slice(0, 40) + '…'
      : drag.data.issueSummary
    ghost.textContent = `${drag.data.issueKey} — ${summary}`
    document.body.appendChild(ghost)
    ghostRef.current = ghost

    const handleMouseMove = (e: MouseEvent) => {
      ghost.style.left = `${e.clientX + 12}px`
      ghost.style.top = `${e.clientY - 16}px`

      const repoId = repoIdAtPoint(e.clientX, e.clientY)
      setOverRepoId(repoId)

      // Highlight the drop zone strip if over a repo
      if (repoId) {
        ghost.style.borderColor = 'rgba(0,136,255,0.9)'
        ghost.style.background = 'rgba(0,50,120,0.95)'
      } else {
        ghost.style.borderColor = 'rgba(0,136,255,0.5)'
        ghost.style.background = 'var(--mantine-color-dark-6, #1a1b1e)'
      }
    }

    const handleMouseUp = (e: MouseEvent) => {
      const repoId = repoIdAtPoint(e.clientX, e.clientY)
      if (repoId && drag) {
        onDrop(repoId, drag.data)
      }
      cleanup()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cleanup()
    }

    const cleanup = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('keydown', handleKeyDown)
      if (ghostRef.current) {
        document.body.removeChild(ghostRef.current)
        ghostRef.current = null
      }
      setDrag(null)
      setOverRepoId(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('keydown', handleKeyDown)

    return cleanup
  }, [drag, onDrop])

  return {
    isDragging: drag !== null,
    draggingKey: drag?.data.issueKey ?? null,
    overRepoId,
    onMouseDown
  }
}
