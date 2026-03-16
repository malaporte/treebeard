import { $ } from 'bun'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const src = path.join(root, 'src')
const dist = path.join(root, 'dist')

const args = process.argv.slice(2)
const buildServer = args.length === 0 || args.includes('--server')
const buildCli = args.length === 0 || args.includes('--cli')

async function buildServerBinaries() {
  const entry = path.join(src, 'server', 'index.ts')

  // Build for both Linux architectures (runs inside leash Docker container)
  const targets = ['bun-linux-x64', 'bun-linux-arm64'] as const

  for (const target of targets) {
    const arch = target.endsWith('x64') ? 'x64' : 'arm64'
    const outfile = path.join(dist, `pippin-server-linux-${arch}`)
    await $`bun build --compile --no-compile-autoload-bunfig --no-compile-autoload-dotenv --target=${target} ${entry} --outfile ${outfile}`
  }
}

async function buildCliBinary() {
  const entry = path.join(src, 'cli', 'index.ts')

  // Build CLI for the host machine's native target
  const outfile = path.join(dist, 'pippin')
  await $`bun build --compile --no-compile-autoload-bunfig --no-compile-autoload-dotenv ${entry} --outfile ${outfile}`
}

if (buildServer) {
  await buildServerBinaries()
}

if (buildCli) {
  await buildCliBinary()
}
