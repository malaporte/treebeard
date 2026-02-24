// PostCSS build script for Mantine CSS.
// Electrobun's Bun.build doesn't support PostCSS, so we process
// @mantine/core/styles.css separately and output to src/mainview/styles.css.

import postcss from 'postcss'
import postcssPresetMantine from 'postcss-preset-mantine'
import postcssSimpleVars from 'postcss-simple-vars'
import fs from 'node:fs'
import path from 'node:path'

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
