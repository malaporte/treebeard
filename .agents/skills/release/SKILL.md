# Skill: release

## Purpose

Walk through creating a new Treebeard release: read the current version, inspect
commits since the last tag to recommend a semver bump, update `package.json`,
commit, tag, and push to trigger the CI/CD release pipeline.

## Semver Rules

This project follows [Semantic Versioning](https://semver.org/):

| Situation | Bump |
|-----------|------|
| Any commit with `!` suffix or `BREAKING CHANGE:` in body | **major** (`X.0.0`) |
| Any `feat:` commit | **minor** (`x.Y.0`) |
| Any `fix:`, `perf:`, `refactor:` commit | **patch** (`x.y.Z`) |
| Only `docs:`, `chore:`, `ci:`, `test:`, `style:` | **patch** (or consider skipping the release) |

Commits use [Conventional Commits](https://www.conventionalcommits.org/) prefixes.
The highest-priority rule across all commits since the last tag wins.

## Instructions

### Step 1: Check for Uncommitted Changes

```bash
git status --porcelain
```

If the output is non-empty, **stop** and ask the user to commit or stash their
changes before proceeding.

### Step 2: Read the Current Version

```bash
cat packages/treebeard/package.json
```

Extract the `"version"` field (e.g. `"2.0.2"`). Store this as `{current_version}`.

### Step 3: Find the Last Tag and Inspect Commits

```bash
git describe --tags --abbrev=0
```

Store the result as `{last_tag}` (e.g. `v2.0.2`).

If no tag exists, skip ahead to Step 4 and ask the user to provide the full
version number manually.

List commits since the last tag:

```bash
git log {last_tag}..HEAD --oneline
```

If there are **no commits** since the last tag, inform the user and stop:

```
No commits found since {last_tag}. There is nothing to release.
```

Otherwise, apply the semver rules above to determine the recommended bump type.
Present your reasoning clearly, for example:

```
Current version : 2.0.2
Commits since v2.0.2:
  a1b43d5 feat: make CI status badge clickable
  366ade7 docs: flesh out README

Analysis:
  - 1 × feat  → minor bump recommended

Recommended next version: 2.1.0  (minor bump)
```

Ask the user to confirm or provide a different version before continuing.
Store the confirmed version as `{new_version}` (without the `v` prefix, e.g. `2.1.0`).

### Step 4: Update package.json

Edit `packages/treebeard/package.json`, changing the `"version"` field from
`{current_version}` to `{new_version}`.

Verify the change looks correct before committing.

### Step 5: Commit the Version Bump

```bash
git add packages/treebeard/package.json
git commit -m "chore: bump version to v{new_version}"
```

### Step 6: Create the Git Tag

Check that the tag does not already exist:

```bash
git tag | grep "^v{new_version}$"
```

If it already exists, **stop** and warn the user before proceeding.

Otherwise create the tag:

```bash
git tag v{new_version}
```

### Step 7: Push Commit and Tag

```bash
git push && git push --tags
```

### Step 8: Confirm

Report success:

```
Released v{new_version}.

The tag push has triggered the CI/CD pipeline, which will build and
publish the release automatically.
```
