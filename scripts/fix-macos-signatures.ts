import fs from 'node:fs'
import path from 'node:path'

function isMacBuild(): boolean {
  return process.platform === 'darwin' && process.env.ELECTROBUN_OS === 'macos'
}

function hasRealSigningConfig(): boolean {
  return Boolean(process.env.ELECTROBUN_DEVELOPER_ID)
}

function removeSignature(targetPath: string): void {
  const result = Bun.spawnSync(['codesign', '--remove-signature', targetPath], {
    stderr: 'pipe',
    stdout: 'ignore'
  })

  if (result.exitCode === 0) {
    return
  }

  const message = result.stderr ? new TextDecoder().decode(result.stderr).trim() : ''

  if (
    message.includes('code object is not signed at all') ||
    message.includes('is already unsigned') ||
    message.includes('bundle format is ambiguous')
  ) {
    return
  }

  throw new Error(message || `codesign --remove-signature failed for ${targetPath}`)
}

function looksLikeSignedCode(filePath: string): boolean {
  const baseName = path.basename(filePath)

  if (baseName.endsWith('.dylib') || baseName.endsWith('.so') || !baseName.includes('.')) {
    return true
  }

  const fileInfo = Bun.spawnSync(['file', '-b', filePath], {
    stdout: 'pipe',
    stderr: 'ignore'
  })

  const description = fileInfo.stdout ? new TextDecoder().decode(fileInfo.stdout).trim() : ''
  return description.includes('Mach-O')
}

function walkAppBundle(appPath: string): string[] {
  const targets: string[] = []
  const stack = [appPath]

  while (stack.length > 0) {
    const currentPath = stack.pop()
    if (!currentPath) {
      continue
    }

    const stat = fs.lstatSync(currentPath)
    if (stat.isDirectory()) {
      const baseName = path.basename(currentPath)
      if (currentPath !== appPath && (baseName.endsWith('.app') || baseName.endsWith('.framework'))) {
        targets.push(currentPath)
      }

      const entries = fs.readdirSync(currentPath)
      for (const entry of entries) {
        stack.push(path.join(currentPath, entry))
      }
      continue
    }

    if (stat.isFile() && looksLikeSignedCode(currentPath)) {
      targets.push(currentPath)
    }
  }

  targets.push(appPath)
  return targets
}

function getAppBundles(buildDir: string): string[] {
  return fs
    .readdirSync(buildDir)
    .filter((entry) => entry.endsWith('.app'))
    .map((entry) => path.join(buildDir, entry))
}

function main(): void {
  if (!isMacBuild() || hasRealSigningConfig()) {
    return
  }

  const wrapperBundlePath = process.env.ELECTROBUN_WRAPPER_BUNDLE_PATH
  if (wrapperBundlePath) {
    const targets = walkAppBundle(wrapperBundlePath)
    for (const target of targets) {
      removeSignature(target)
    }
    return
  }

  const buildDir = process.env.ELECTROBUN_BUILD_DIR
  if (!buildDir) {
    throw new Error('ELECTROBUN_BUILD_DIR is required when ELECTROBUN_WRAPPER_BUNDLE_PATH is absent')
  }

  const appBundles = getAppBundles(buildDir)
  for (const appBundle of appBundles) {
    const targets = walkAppBundle(appBundle)
    for (const target of targets) {
      removeSignature(target)
    }
  }
}

main()
