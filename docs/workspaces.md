# Multi-Repo Workspaces

Workspaces let you group two or more repositories into a named unit and manage their worktrees together. Instead of creating the same branch three times across three separate repo sections, you create one workspace worktree and Treebeard handles the rest.

## What is a workspace?

A workspace is a named group of repositories with a filesystem-safe slug. When you create a worktree on a workspace, Treebeard checks out the same branch across every member repo and places them as siblings inside a single parent folder:

```
~/Developer/worktrees/<workspace-slug>/<branch>/
  ├─ frontend/
  ├─ backend/
  └─ shared-lib/
```

You can then open that parent folder in VS Code, Cursor, or Ghostty once and work across all repos together.

## Setting up a workspace

1. Open **Settings → Workspaces**.
2. Fill in a **Name** (e.g. `Checkout Feature`) and a **Slug** (e.g. `checkout`). The slug is used as the folder name on disk and must match `[a-z0-9][a-z0-9-]*`.
3. Select **two or more repositories** from the list of already-configured repos.
4. Click **Add Workspace**.

The workspace appears immediately in the dashboard alongside your individual repo sections.

## Creating a workspace worktree

Click the **+** button on a workspace section to open the Add Worktree modal.

- **New branch** — enter a branch name; Treebeard creates it on every member repo.
- **Existing branch** — shows only branches that exist on every member's remote (set intersection). Select one to check it out across all members.

The modal previews the filesystem layout before you submit. On success, the workspace worktree card appears in the section.

If creation fails partway through (e.g. a branch already exists on one repo), Treebeard rolls back the already-created member worktrees and cleans up the parent folder. Per-repo error details are shown so you can diagnose and retry.

## Workspace worktree cards

Each card shows:

- **Branch name** and an **Incomplete** badge if any member is missing the worktree.
- **Rolled-up dirty status** — lines added/deleted and unpushed/unpulled commits summed across all members.
- **Workspace-level launch buttons** — open the workspace root folder in your IDE or Ghostty.
- **Expand** (chevron) — reveals per-repo rows with individual dirty badges, Jira badges, and per-repo launch buttons.

Double-clicking a card opens the workspace root in your default IDE.

## Incomplete worktrees

A workspace worktree is *incomplete* when some member repos have the branch and others don't (e.g. after a partial failure or a manual `git worktree remove`). The card shows a yellow **Incomplete** badge and two actions:

- **Repair** — creates the missing member worktrees.
- **Remove partial** — deletes the existing member worktrees so the workspace worktree disappears cleanly.

## Fetch and pull

- The **refresh** button on a workspace section fetches from origin across all member repos in parallel.
- A future pull action on a workspace worktree card will pull all member worktrees for that branch.

## Jira drag-and-drop

Dropping a Jira issue card onto a workspace section opens the Add Worktree modal with the issue key pre-filled as the branch name prefix — the same behaviour as dropping onto a single-repo section.

## Removing a workspace

Go to **Settings → Workspaces**, expand the workspace, and click the trash icon. This removes the workspace configuration only — existing worktrees on disk are not deleted.

To delete the actual worktrees, use the delete action on each workspace worktree card before removing the workspace from settings.

## Notes

- Repos that belong to a workspace still appear as their own standalone sections. Workspace membership is additive, not exclusive.
- A repo can belong to multiple workspaces.
- Removing a repo from Settings that is referenced by a workspace will prompt you with options: remove the repo from affected workspaces, delete those workspaces entirely, or cancel.
- Workspace slugs must be unique. Duplicate slugs are dropped during config sanitization (first occurrence wins).
