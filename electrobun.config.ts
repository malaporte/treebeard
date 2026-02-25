import type { ElectrobunConfig } from 'electrobun'

export default {
  app: {
    name: 'Treebeard',
    identifier: 'com.treebeard.app',
    version: '1.0.0'
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
      'src/mainview/index.html': 'views/mainview/index.html',
      'src/mainview/styles.css': 'views/mainview/styles.css'
    }
  },
  scripts: {
    postBuild: './scripts/build-css.ts'
  }
} satisfies ElectrobunConfig
