import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getConfig, setConfig } from './config'
import { getWorktrees } from './git'
import type { Workspace, WorkspaceMember } from '../../shared/types'

const WORKSPACES_ROOT = path.join(os.homedir(), 'Developer', 'workspaces')

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function isWorkspacePath(workspacePath: string): boolean {
  const relative = path.relative(WORKSPACES_ROOT, workspacePath)
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function removeEmptyWorkspaceDirectory(workspacePath: string): void {
  if (!isWorkspacePath(workspacePath)) return
  try {
    fs.rmdirSync(workspacePath)
  } catch {
    return
  }
}

function removeWorkspaceLink(member: WorkspaceMember): void {
  if (member.linkPath === member.worktreePath) return
  try {
    if (fs.lstatSync(member.linkPath).isSymbolicLink()) fs.unlinkSync(member.linkPath)
  } catch {
    return
  }
}

function replaceWorkspaceLink(member: WorkspaceMember, nextWorktreePath: string): void {
  if (member.linkPath === member.worktreePath) return
  removeWorkspaceLink(member)
  try {
    fs.symlinkSync(nextWorktreePath, member.linkPath, 'dir')
  } catch {
    return
  }
}

/** Create an empty workspace rooted below ~/Developer/workspaces. */
export function createWorkspace(name: string): { success: boolean; workspace?: Workspace; error?: string } {
  const trimmedName = name.trim()
  const slug = slugify(trimmedName)
  if (!slug) return { success: false, error: 'Enter a workspace name containing letters or numbers.' }

  const config = getConfig()
  const workspacePath = path.join(WORKSPACES_ROOT, slug)
  if (config.workspaces.some((workspace) => workspace.path === workspacePath)) {
    return { success: false, error: 'A workspace with this folder already exists.' }
  }
  if (fs.existsSync(workspacePath)) {
    return { success: false, error: 'The workspace folder already exists.' }
  }

  const workspace: Workspace = {
    id: crypto.randomUUID(),
    name: trimmedName,
    path: workspacePath,
    members: []
  }

  try {
    fs.mkdirSync(workspacePath, { recursive: true })
    setConfig({ ...config, workspaces: [...config.workspaces, workspace] })
    return { success: true, workspace }
  } catch (err: unknown) {
    removeEmptyWorkspaceDirectory(workspacePath)
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Attach an existing worktree to a workspace through a symlink. */
export async function attachWorkspaceWorktree(
  workspaceId: string,
  repoId: string,
  worktreePath: string
): Promise<{ success: boolean; error?: string }> {
  const config = getConfig()
  const workspace = config.workspaces.find((candidate) => candidate.id === workspaceId)
  const repo = config.repositories.find((candidate) => candidate.id === repoId)
  if (!workspace || !repo) return { success: false, error: 'The workspace or repository no longer exists.' }
  if (workspace.members.some((member) => member.repoId === repoId)) {
    return { success: false, error: 'This repository is already in the workspace.' }
  }

  const repoFolder = slugify(repo.name) || repo.id
  const linkPath = path.join(workspace.path, repoFolder)
  if (fs.existsSync(linkPath)) {
    return { success: false, error: 'The workspace already contains this repository folder.' }
  }

  try {
    const worktrees = await getWorktrees(repo.path)
    const worktree = worktrees.find((candidate) => candidate.path === worktreePath)
    if (!worktree || worktree.isMain) {
      return { success: false, error: 'Choose an existing non-main worktree from this repository.' }
    }
  } catch {
    return { success: false, error: 'Could not verify the selected worktree.' }
  }

  try {
    fs.symlinkSync(worktreePath, linkPath, 'dir')
    setConfig({
      ...config,
      workspaces: config.workspaces.map((candidate) => candidate.id === workspaceId
        ? { ...candidate, members: [...candidate.members, { repoId, worktreePath, linkPath }] }
        : candidate)
    })
    return { success: true }
  } catch (err: unknown) {
    removeWorkspaceLink({ repoId, worktreePath, linkPath })
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Remove one workspace symlink without deleting its worktree. */
export function removeWorkspaceMember(
  workspaceId: string,
  repoId: string
): { success: boolean; error?: string } {
  const config = getConfig()
  const workspace = config.workspaces.find((candidate) => candidate.id === workspaceId)
  const member = workspace?.members.find((candidate) => candidate.repoId === repoId)
  if (!workspace || !member) return { success: false, error: 'The workspace member no longer exists.' }
  removeWorkspaceLink(member)

  setConfig({
    ...config,
    workspaces: config.workspaces.map((candidate) => candidate.id === workspaceId
      ? { ...candidate, members: candidate.members.filter((item) => item.repoId !== repoId) }
      : candidate),
    kiroCrewSessions: config.kiroCrewSessions
  })
  removeEmptyWorkspaceDirectory(workspace.path)
  return { success: true }
}

/** Remove every workspace symlink and its workspace metadata. */
export function removeWorkspace(workspaceId: string): { success: boolean; error?: string } {
  const config = getConfig()
  const workspace = config.workspaces.find((candidate) => candidate.id === workspaceId)
  if (!workspace) return { success: false, error: 'The workspace no longer exists.' }
  for (const member of workspace.members) removeWorkspaceLink(member)

  setConfig({
    ...config,
    workspaces: config.workspaces.filter((candidate) => candidate.id !== workspaceId),
    kiroCrewSessions: Object.fromEntries(
      Object.entries(config.kiroCrewSessions).filter(([worktreePath]) =>
        worktreePath !== workspace.path
      )
    )
  })
  removeEmptyWorkspaceDirectory(workspace.path)
  return { success: true }
}

/** Detach a worktree from any workspace after it is removed through the standard controls. */
export function detachWorkspaceWorktree(worktreePath: string): void {
  const config = getConfig()
  let changed = false
  const removedMembers: WorkspaceMember[] = []
  const workspaces = config.workspaces.map((workspace) => {
    const members = workspace.members.filter((member) => {
      if (member.worktreePath !== worktreePath) return true
      removedMembers.push(member)
      return false
    })
    if (members.length !== workspace.members.length) changed = true
    return members.length === workspace.members.length ? workspace : { ...workspace, members }
  })
  if (!changed) return
  for (const member of removedMembers) removeWorkspaceLink(member)

  setConfig({
    ...config,
    workspaces,
    kiroCrewSessions: Object.fromEntries(
      Object.entries(config.kiroCrewSessions).filter(([pathKey]) => pathKey !== worktreePath)
    )
  })
}

/** Keep workspace membership and Kiro Crew sessions aligned after a standard worktree rename. */
export function updateWorkspaceWorktreePath(previousPath: string, nextPath: string): void {
  const config = getConfig()
  let changed = false
  const linksToUpdate: WorkspaceMember[] = []
  const workspaces = config.workspaces.map((workspace) => {
    let workspaceChanged = false
    const members = workspace.members.map((member) => {
      if (member.worktreePath !== previousPath) return member
      changed = true
      workspaceChanged = true
      linksToUpdate.push(member)
      return {
        ...member,
        worktreePath: nextPath,
        linkPath: member.linkPath === previousPath ? nextPath : member.linkPath
      }
    })
    return workspaceChanged ? { ...workspace, members } : workspace
  })
  if (!changed) return
  for (const member of linksToUpdate) replaceWorkspaceLink(member, nextPath)

  const sessions = { ...config.kiroCrewSessions }
  if (sessions[previousPath]) {
    sessions[nextPath] = sessions[previousPath]
    delete sessions[previousPath]
  }
  setConfig({ ...config, workspaces, kiroCrewSessions: sessions })
}
