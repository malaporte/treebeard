# Contributing to Treebeard

Thanks for helping improve Treebeard.

## Development Setup

1. Install prerequisites:
   - macOS
   - [Bun](https://bun.sh/)
   - [pnpm](https://pnpm.io/)
   - Git
2. Install dependencies:

```bash
pnpm install
```

3. Run the app in development mode:

```bash
pnpm dev
```

## Before You Open a PR

Run these checks locally:

```bash
pnpm test
pnpm typecheck
pnpm build
```

## Coding Guidelines

- Use TypeScript strict patterns and keep types explicit in services.
- Use named exports only (except the root `App.tsx` default export).
- Use `function` declarations for React components and hooks.
- Keep components small and single-purpose.
- Use `import type` for type-only imports.
- Do not add logging (`console.log`, `console.error`, logging libs).
- Do not add TODO/FIXME comments or commented-out code.

## Project Structure

- `src/bun/`: Bun main process and backend services
- `src/components/`: Renderer UI components
- `src/hooks/`: Renderer data hooks
- `src/shared/`: Shared types and RPC schema

## Pull Requests

- Keep PRs focused and reasonably small.
- Include a clear description of why the change is needed.
- Add screenshots or short clips for UI changes.
- Mention any manual verification steps.

## Commit Messages

- Use concise, descriptive commit messages.
- Prefer intent-first wording (why the change exists).

## Issues

If you found a bug or have an idea, open an issue with:

- expected behavior
- actual behavior
- reproduction steps
- environment details (macOS version, Bun, pnpm)
