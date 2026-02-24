/** Run tsc and filter out errors from node_modules (Electrobun ships raw .ts) */
const proc = Bun.spawn(['npx', 'tsc', '--noEmit'], {
  stdout: 'pipe',
  stderr: 'pipe'
})

const [stdout, stderr] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text()
])

await proc.exited

const ownErrors = stdout
  .split('\n')
  .filter((line) => !line.startsWith('node_modules/'))
  .join('\n')
  .trim()

if (stderr.trim()) process.stderr.write(stderr)

if (ownErrors) {
  process.stdout.write(ownErrors + '\n')
  process.exit(1)
}
