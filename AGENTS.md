# AGENTS.md — Treebeard

## Project Overview

Treebeard is an **Electron** desktop app for managing Git worktrees across repositories,
with Jira issue badges, GitHub PR/CI status, and quick-launch buttons for VS Code,
Ghostty, and OpenCode.

**Stack:** TypeScript (strict), React 18, Mantine v7, electron-vite, pnpm

**Structure:**
- `electron/` — Main process entry (`main.ts`), preload bridge (`preload.ts`), shared types (`types.ts`)
- `electron/services/` — Backend services: `git.ts`, `github.ts`, `jira.ts`, `launcher.ts`, `config.ts`
- `src/` — Renderer process (React app)
- `src/components/` — Flat directory of single-purpose React components
- `src/hooks/` — Custom hooks (`useWorktrees`, `usePR`, `useJiraIssue`, `useConfig`)

## Build / Run Commands

| Command            | Description                                      |
| ------------------ | ------------------------------------------------ |
| `pnpm dev`         | Start in development mode with hot-reload        |
| `pnpm build`       | Production build via electron-vite               |
| `pnpm preview`     | Preview the production build                     |
| `pnpm typecheck`   | Type-check only (`tsc --noEmit`)                 |

**No test framework, linter, or formatter is configured.** If vitest is added later:
```bash
pnpm vitest run path/to/file.test.ts          # single test file
pnpm vitest run -t "test name pattern"         # single test by name
```

## Code Style

### Imports

Three groups, no blank lines between them:
1. Node.js stdlib (always use `node:` prefix: `import path from 'node:path'`)
2. Third-party packages (`@mantine/core`, `@tabler/icons-react`)
3. Local/relative imports (`./components/...`, `../hooks/...`)

Type-only imports use `import type` on a separate line, placed last in the import block:
```ts
import { execFile } from 'node:child_process'
import { Card, Text, Group } from '@mantine/core'
import { JiraBadge } from './JiraBadge'
import type { Worktree } from '../../electron/types'
```

### Naming Conventions

| Kind                | Convention       | Examples                                         |
| ------------------- | ---------------- | ------------------------------------------------ |
| Component files     | PascalCase       | `WorktreeCard.tsx`, `PRBadge.tsx`                |
| Hook files          | camelCase        | `useWorktrees.ts`, `usePR.ts`                   |
| Service files       | camelCase        | `git.ts`, `github.ts`                           |
| React components    | PascalCase       | `function WorktreeCard()`                        |
| Hooks               | `use` prefix     | `function useJiraIssue()`                        |
| Event handlers      | `handle` prefix  | `handleSubmit`, `handleBrowse`                   |
| Functions/variables | camelCase        | `getWorktrees`, `worktreePath`                   |
| Interfaces/types    | PascalCase       | `Worktree`, `PRInfo`, `AppConfig`                |
| Props interfaces    | `*Props` suffix  | `WorktreeCardProps`, `PRBadgeProps`              |
| Constants           | UPPER_SNAKE_CASE | `MAIN_BRANCH_NAMES`, `JIRA_KEY_REGEX`           |

### Types

- Use `interface` for all object shapes. Reserve `type` for aliases and unions only.
- Explicit return type annotations on **exported service functions** (`Promise<Worktree[]>`).
- Inferred return types on React components and hooks.
- Use `as const` for literal lookup objects (e.g., the `IPC` channel map).
- Use `import type` consistently for type-only imports — never mix into value imports.
- Prefer inline union literals over enums: `'OPEN' | 'CLOSED' | 'MERGED'`.

### Functions

- **Components and hooks:** Always use `function` declarations, never arrow functions.
  ```ts
  export function WorktreeCard({ worktree, repoPath }: WorktreeCardProps) {
  ```
- **Callbacks and handlers:** Use arrow functions.
  ```ts
  const handleVSCode = async () => { ... }
  worktrees.filter((wt) => wt.branch.includes(query))
  ```

### Exports

- **Named exports only.** No default exports (sole exception: root `App.tsx`).
- **No barrel files.** Every import targets the specific file directly.

### Error Handling

- **Services (electron side):** Catch errors silently and return `null` for non-critical failures.
  Use empty `catch` blocks (no error variable) when the error is not inspected:
  ```ts
  catch {
    return null
  }
  ```
- **User-facing operations:** Return `{ success: boolean; error?: string }` instead of throwing.
  Extract messages with: `err instanceof Error ? err.message : String(err)`
- **Hooks (renderer side):** Try/catch in async callbacks, set state to `null` on failure,
  always include a `finally` block to clear loading state:
  ```ts
  try {
    const result = await window.treebeard.gh.pr(repoPath, branch)
    setPR(result)
  } catch {
    setPR(null)
  } finally {
    setLoading(false)
  }
  ```
- **No custom error classes.** No error boundaries. No `console.error` logging.

### Comments

- Comments explain **why**, never **what**. Do not restate code in comments.
- `/** */` JSDoc on exported service functions — short purpose description, no `@param`/`@returns` tags.
- `//` inline comments only for non-obvious logic, workarounds, or edge cases.
- `// --- Section Name ---` dividers in large files (e.g., `main.ts`).
- No `TODO`/`FIXME` comments. No commented-out code.

### Components

- Props interface defined immediately above the component in the same file.
- Lookup/mapping objects (icon maps, color maps) as module-level `UPPER_SNAKE_CASE` constants.
- Styling via Mantine component props and inline `style` attributes — no CSS modules or stylesheets.
- Components are small and single-purpose (30-170 lines).

### Hook Pattern

All data-fetching hooks follow this structure:
```ts
export function useThing(arg: string | null) {
  const [data, setData] = useState<Thing | null>(null)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!arg) return
    setLoading(true)
    try {
      const result = await window.treebeard.thing.get(arg)
      setData(result)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [arg])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, refresh: fetch }
}
```

### Logging

Zero logging in the codebase. No `console.log`, `console.error`, or logging libraries.

## Architecture Notes

- **IPC:** Uses Electron's invoke/handle pattern (`ipcMain.handle` / `ipcRenderer.invoke`).
  Channel names are defined in `electron/types.ts` as an `IPC` const object.
- **Preload bridge:** `preload.ts` exposes a typed API via `contextBridge.exposeInMainWorld('treebeard', api)`.
  Renderer code accesses it through `window.treebeard.*`. Type safety via `global.d.ts`.
- **Persistence:** App config stored via `electron-store` with typed `Store<AppConfig>`.
- **State management:** Local `useState` + custom hooks only. No external state library.
- **External CLIs:** GitHub data via `gh` CLI, Jira data via `jira` CLI, both called from main process
  via `child_process.execFile`. Failures return `null` silently.
