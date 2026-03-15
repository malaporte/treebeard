import fs from 'node:fs'
import path from 'node:path'

const buildDir = process.env.ELECTROBUN_BUILD_DIR

if (!buildDir) process.exit(0)

const iconSourcePath = path.resolve('AppIcon.icns')
if (!fs.existsSync(iconSourcePath)) process.exit(0)

for (const entry of fs.readdirSync(buildDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.endsWith('.app')) continue

  const resourcesPath = path.join(buildDir, entry.name, 'Contents', 'Resources')
  if (!fs.existsSync(resourcesPath)) continue

  // Electrobun's iconutil step is currently unreliable for this project.
  // Copying the checked-in .icns guarantees the bundle keeps a Dock icon.
  fs.copyFileSync(iconSourcePath, path.join(resourcesPath, 'AppIcon.icns'))
}
