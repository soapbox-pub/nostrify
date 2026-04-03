# Release Skill

This skill documents how to perform a release of the Nostrify monorepo packages.

## Overview

Nostrify uses [Changesets](https://github.com/changesets/changesets) to manage versioning and changelogs across all packages. Releases follow a two-phase process: versioning (bumping versions + generating changelogs) and publishing.

## Release Process

### 1. Identify unreleased commits

Find the last "Version packages" commit and check what has been added since:

```sh
git log --oneline -20
```

Commits since the last `Version packages` commit need changesets if they do not already have one.

### 2. Create changesets for unreleased commits

For each unreleased commit that does not already have a changeset, create a `.changeset/<descriptive-name>.md` file:

```md
---
"@nostrify/nostrify": patch
---

Description of the change.
```

**Bump type rules:**
- `patch` — bug fixes (`fix:` commits)
- `minor` — new features (`feat:` commits)
- `major` — breaking changes

**Package names** (use only the ones affected by the change):
- `@nostrify/nostrify`
- `@nostrify/types`
- `@nostrify/db`
- `@nostrify/react`
- `@nostrify/policies`
- `@nostrify/seed`
- `@nostrify/ndk`
- `@nostrify/strfry`

Note: some commits may have already manually updated `CHANGELOG.md` and `package.json` directly (bypassing changesets). Check before creating a duplicate changeset.

### 3. Run changeset version

```sh
pnpm pkgs:version
```

This consumes all `.changeset/*.md` files, bumps the affected package versions, and updates each package's `CHANGELOG.md`. Packages that depend on a bumped package also get a patch bump automatically.

### 4. Build all packages

```sh
pnpm i -r
pnpm build:all
```

All 8 packages must build with no errors before committing.

### 5. Commit

```sh
git add -A
git commit -m "Version packages"
```

This matches the project's existing commit message convention for release commits.

### 6. Publish (when ready)

```sh
pnpm pkgs:publish
```

This runs `changeset publish` and publishes all packages with updated versions to the registry.

## Package Scripts Reference

| Script | Command | Description |
|---|---|---|
| `pnpm changeset` | `changeset` | Interactively create a changeset |
| `pnpm pkgs:version` | `changeset version` | Bump versions and update changelogs |
| `pnpm pkgs:publish` | `changeset publish` | Publish packages to registry |
| `pnpm build:all` | `turbo run build` | Build all packages |
| `pnpm test` | `turbo run test` | Run all tests |

## Notes

- The `.changeset/config.json` has `"commit": false`, so changesets do not auto-commit.
- Internal workspace dependencies (`workspace:*`) are automatically bumped by a `patch` when their dependency is versioned, per `"updateInternalDependencies": "patch"` in the config.
- `@nostrify/types` and `@nostrify/strfry` are not always affected — only include them in a changeset if the commit actually touches those packages.
