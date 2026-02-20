import Store from 'electron-store'
import { v4 as uuidv4 } from 'uuid'
import type { AppConfig, RepoConfig } from '../types'

const store = new Store<AppConfig>({
  name: 'treebeard-config',
  defaults: {
    repositories: [],
    pollIntervalSec: 60,
    collapsedRepos: []
  }
})

export function getConfig(): AppConfig {
  return {
    repositories: store.get('repositories'),
    pollIntervalSec: store.get('pollIntervalSec'),
    collapsedRepos: store.get('collapsedRepos')
  }
}

export function setConfig(config: AppConfig): void {
  store.set('repositories', config.repositories)
  store.set('pollIntervalSec', config.pollIntervalSec)
  store.set('collapsedRepos', config.collapsedRepos)
}

export function getCollapsedRepos(): string[] {
  return store.get('collapsedRepos')
}

export function setCollapsedRepos(ids: string[]): void {
  store.set('collapsedRepos', ids)
}

export function addRepository(name: string, path: string): RepoConfig {
  const repo: RepoConfig = { id: uuidv4(), name, path }
  const repos = store.get('repositories')
  repos.push(repo)
  store.set('repositories', repos)
  return repo
}

export function removeRepository(id: string): void {
  const repos = store.get('repositories')
  store.set(
    'repositories',
    repos.filter((r) => r.id !== id)
  )
}
