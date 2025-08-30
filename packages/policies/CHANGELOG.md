# Changelog

## 0.36.6

### Patch Changes

- Get tests passing in CI, use esbuild to build final JS files
- Updated dependencies
  - @nostrify/nostrify@0.46.8
  - @nostrify/types@0.36.4

## 0.36.5

### Patch Changes

- fix imports in workspace packages
- Updated dependencies
  - @nostrify/nostrify@0.46.7
  - @nostrify/types@0.36.3

## 0.36.4

### Patch Changes

- Fix typescript config so it outputs ESM not CJS built files
- Updated dependencies
  - @nostrify/nostrify@0.46.6
  - @nostrify/types@0.36.2

## 0.36.3

### Patch Changes

- fix package.json setup
- Updated dependencies
  - @nostrify/nostrify@0.46.5
  - @nostrify/types@0.36.1

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.36.2 - 2025-06-06

### Fixed

- DomainPolicy blacklist now includes subdomains.

## 0.36.1 - 2024-10-09

### Fixed

- WoTPolicy: fix unhandled promise rejection by delaying getPubkeys until the first call.

## 0.36.0 - 2024-09-25

### Added

- Added WoTPolicy to whitelist follows of follows.

## 0.35.0 - 2024-09-23

### Added

- AntiDuplicationPolicy: added `deobfuscate` option to pre-process event content before taking the hash.

## 0.34.0 - 2024-09-21

### Added

- Added DomainPolicy to filter events by NIP-05 domain.

## 0.33.1 - 2024-09-11

### Fixed

- AuthorPolicy: treat kind 0s as its own author

## 0.33.0 - 2024-09-09

### Fixed

- Exported `ReplyBotPolicy` and `AuthorPolicy`.

## 0.32.0 - 2024-09-09

### Added

- ReplyBotPolicy: accept a `signal`.
- PipePolicy: accept a `signal`.
- AnyPolicy: accept a `signal`.

### Changed

- BREAKING: OpenAIPolicy: Removed `timeout` opt. It now accept a `signal` in its `call` method.

## 0.31.0 - 2024-09-09

### Added

- Initial release of `@nostrify/policies`, moved from `@nostrify/nostrify/policies`.
