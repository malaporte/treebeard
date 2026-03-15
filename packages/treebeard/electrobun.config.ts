import type { ElectrobunConfig } from 'electrobun'

export default {
  app: {
    name: 'Treebeard',
    identifier: 'com.treebeard.app',
    version: '1.1.4'
  },
  runtime: {
    exitOnLastWindowClosed: true
  },
  build: {
    mac: {
      icons: 'AppIcon.iconset',
      codesign: true
    },
    bun: {
      entrypoint: 'src/bun/index.ts'
    },
    views: {
      mainview: {
        entrypoint: 'src/mainview/index.tsx'
      }
    },
    copy: {
      'src/mainview/index.html': 'views/mainview/index.html',
      '../../packages/pippin/dist/pippin': 'bin/pippin',
      '../../packages/pippin/dist/pippin-server-linux-arm64': 'bin/pippin-server-linux-arm64',
      '../../packages/pippin/dist/pippin-server-linux-x64': 'bin/pippin-server-linux-x64'
    }
  },
  scripts: {
    preBuild: './scripts/pre-build.ts',
    postBuild: './scripts/copy-macos-icon.ts'
  },
  release: {
    baseUrl: 'https://github.com/malaporte/treebeard/releases/latest/download'
  }
} satisfies ElectrobunConfig
