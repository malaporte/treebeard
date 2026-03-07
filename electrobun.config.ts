import type { ElectrobunConfig } from 'electrobun'

const shouldCodesign =
  process.env.ELECTROBUN_OS === 'macos' &&
  Boolean(process.env.ELECTROBUN_DEVELOPER_ID)

const shouldNotarize =
  shouldCodesign &&
  Boolean(process.env.ELECTROBUN_APPLEID) &&
  Boolean(process.env.ELECTROBUN_APPLEIDPASS) &&
  Boolean(process.env.ELECTROBUN_TEAMID)

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
      icons: 'AppIcon.iconset',
      codesign: shouldCodesign,
      notarize: shouldNotarize
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
    preBuild: './scripts/build-css.ts',
    postWrap: './scripts/fix-macos-signatures.ts'
  },
  release: {
    baseUrl: 'https://github.com/malaporte/treebeard/releases/latest/download'
  }
} satisfies ElectrobunConfig
