import { $ } from 'bun'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const root = path.resolve(import.meta.dirname, '..')
const entry = path.join(root, 'src', 'cli', 'index.ts')
const dist = path.join(root, 'dist', 'pippin')
const installDir = path.join(os.homedir(), '.local', 'bin')
const installPath = path.join(installDir, 'pippin')

// Build the CLI binary for the host machine
await $`bun build --compile --no-compile-autoload-bunfig --no-compile-autoload-dotenv ${entry} --outfile ${dist}`

// Copy to ~/.local/bin/pippin
fs.mkdirSync(installDir, { recursive: true })
fs.copyFileSync(dist, installPath)
fs.chmodSync(installPath, 0o755)
