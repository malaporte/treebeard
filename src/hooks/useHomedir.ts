import { useState, useEffect, useCallback } from 'react'
import { rpc } from '../rpc'

export function useHomedir() {
  const [homedir, setHomedir] = useState<string | null>(null)

  useEffect(() => {
    rpc().request['system:homedir']({}).then(setHomedir)
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
