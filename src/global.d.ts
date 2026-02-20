import type { TreebeardAPI } from '../electron/preload'

declare global {
  interface Window {
    treebeard: TreebeardAPI
  }
}
