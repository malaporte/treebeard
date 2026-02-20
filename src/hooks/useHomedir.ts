import { useState, useEffect, useCallback } from 'react'

export function useHomedir() {
  const [homedir, setHomedir] = useState<string | null>(null)

  useEffect(() => {
    window.treebeard.system.homedir().then(setHomedir)
  }, [])

  const shortenPath = useCallback(
    (filepath: string) => {
      if (!homedir || !filepath.startsWith(homedir)) return filepath
      return '~' + filepath.slice(homedir.length)
    },
    [homedir]
  )

  return { homedir, shortenPath }
}
