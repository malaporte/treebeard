// Pre-build script: processes Mantine CSS and compiles pippin binaries.
// Electrobun runs this before the app build so all assets are ready for bundling.

import { $ } from 'bun'
import postcss from 'postcss'
import postcssPresetMantine from 'postcss-preset-mantine'
import postcssSimpleVars from 'postcss-simple-vars'
import fs from 'node:fs'
import path from 'node:path'

// --- CSS ---

const mantineCssPath = path.resolve('node_modules/@mantine/core/styles.css')
const outputPath = path.resolve('src/mainview/styles.css')

const css = fs.readFileSync(mantineCssPath, 'utf-8')

const result = await postcss([
  postcssPresetMantine(),
  postcssSimpleVars({
    variables: {
      'mantine-breakpoint-xs': '36em',
      'mantine-breakpoint-sm': '48em',
      'mantine-breakpoint-md': '62em',
      'mantine-breakpoint-lg': '75em',
      'mantine-breakpoint-xl': '88em'
    }
  })
]).process(css, { from: mantineCssPath, to: outputPath })

fs.writeFileSync(outputPath, result.css)

if (result.map) {
  fs.writeFileSync(outputPath + '.map', result.map.toString())
}

// --- Pippin binaries ---

const workspaceRoot = path.resolve(__dirname, '..', '..', '..')
await $`bun run --filter pippin build`.cwd(workspaceRoot)
