import type { IdeId } from './types'

export interface IdeDefinition {
  id: IdeId
  label: string
  command: string[]
  color: string
}

export const IDE_REGISTRY: Record<IdeId, IdeDefinition> = {
  vscode: { id: 'vscode', label: 'VS Code', command: ['code'], color: 'neon' },
  cursor: { id: 'cursor', label: 'Cursor', command: ['cursor'], color: 'violet' },
  intellij: { id: 'intellij', label: 'IntelliJ IDEA', command: ['idea'], color: 'orange' },
  webstorm: { id: 'webstorm', label: 'WebStorm', command: ['webstorm'], color: 'cyan' },
  zed: { id: 'zed', label: 'Zed', command: ['zed'], color: 'lime' },
  sublime: { id: 'sublime', label: 'Sublime Text', command: ['subl'], color: 'yellow' }
}

export const IDE_OPTIONS: IdeId[] = ['vscode', 'cursor', 'intellij', 'webstorm', 'zed', 'sublime']

export function isValidIdeId(value: unknown): value is IdeId {
  return typeof value === 'string' && value in IDE_REGISTRY
}
