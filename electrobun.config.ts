import type { ElectrobunConfig } from 'electrobun'

export default {
  app: {
    name: 'Treebeard',
    identifier: 'com.treebeard.app',
    version: '1.0.2'
  },
  runtime: {
    exitOnLastWindowClosed: true
  },
  build: {
    mac: {
      icons: 'AppIcon.iconset'
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
      'src/mainview/index.html': 'views/mainview/index.html'
    }
  },
  scripts: {
    preBuild: './scripts/build-css.ts'
  },
  release: {
    baseUrl: 'https://github.com/malaporte/treebeard/releases/latest/download'
  }
} satisfies ElectrobunConfig
