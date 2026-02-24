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
      },
      terminal: {
        entrypoint: 'src/terminal/index.tsx'
      }
    },
    copy: {
      'src/mainview/index.html': 'views/mainview/index.html',
      'src/mainview/styles.css': 'views/mainview/styles.css',
      'src/terminal/index.html': 'views/terminal/index.html',
      'node_modules/@xterm/xterm/css/xterm.css': 'views/terminal/xterm.css',
      'node_modules/bun-pty/rust-pty/target/release/librust_pty_arm64.dylib': 'bun/rust-pty/target/release/librust_pty_arm64.dylib'
    }
  },
  scripts: {
    postBuild: './scripts/build-css.ts'
  }
} satisfies ElectrobunConfig
