import { IconBrandVscode } from '@tabler/icons-react'
import type { IdeId } from '../shared/types'

interface IdeIconProps {
  ide: IdeId
  size?: number
}

/** Custom SVG icon for Cursor editor */
function CursorIcon({ size }: { size: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3l12 9-5 1-3 5z" />
      <path d="M13 13l5 5" />
    </svg>
  )
}

/** Simplified IntelliJ diamond icon */
function IntelliJIcon({ size }: { size: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 17h5" />
      <path d="M8 7h2v6H8z" fill="currentColor" />
      <path d="M12 7h2l2 3-2 3h-2l2-3z" />
    </svg>
  )
}

/** WebStorm icon — stylized WS in a rounded square */
function WebStormIcon({ size }: { size: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 17h5" />
      <path d="M7 8l2 6 2-4 2 4 2-6" />
    </svg>
  )
}

/** Zed icon — stylized Z bolt */
function ZedIcon({ size }: { size: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 7h10l-10 10h10" />
    </svg>
  )
}

/** Sublime Text icon — stylized S */
function SublimeIcon({ size }: { size: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8l12-3v5L6 13" />
      <path d="M6 11l12 3v5L6 16" />
    </svg>
  )
}

const IDE_ICON_MAP: Record<IdeId, ({ size }: { size: number }) => React.ReactElement> = {
  vscode: ({ size }) => <IconBrandVscode size={size} />,
  cursor: CursorIcon,
  intellij: IntelliJIcon,
  webstorm: WebStormIcon,
  zed: ZedIcon,
  sublime: SublimeIcon
}

export function IdeIcon({ ide, size = 16 }: IdeIconProps) {
  const Icon = IDE_ICON_MAP[ide]
  return <Icon size={size} />
}
