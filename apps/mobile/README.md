# Treebeard Mobile (Foundation)

This is an Expo-based mobile foundation for Treebeard.

Current scope:

- Pair to the desktop LAN bridge using one-time token/deep link from a QR payload
- List worktrees from the desktop bridge
- Enable/disable OpenCode servers for each worktree
- Open the OpenCode web UI in an in-app WebView

## Run locally

```bash
cd apps/mobile
pnpm install
pnpm dev
```

Then open with Expo Go or an iOS/Android simulator.

## Desktop prerequisites

In Treebeard desktop:

- Enable the Mobile Bridge in Settings
- Generate a pairing QR token in Settings
- Scan the QR in the mobile app (or paste deep link/token manually)

Use the bridge URL and one-time token/deep link in the mobile app pairing screen.
