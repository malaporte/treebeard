# Treebeard Mobile (Foundation)

This is an Expo-based mobile foundation for Treebeard.

Current scope:

- Pair to the desktop LAN bridge using bridge URL + pairing code
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
- Copy one of the bridge URLs
- Copy the pairing code

Use those values in the mobile app pairing screen.
