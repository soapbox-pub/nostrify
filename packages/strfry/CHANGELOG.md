# Changelog

## 0.2.4

### Patch Changes

- fix imports in workspace packages
- Updated dependencies
  - @nostrify/types@0.36.3

## 0.2.3

### Patch Changes

- Fix typescript config so it outputs ESM not CJS built files
- Updated dependencies
  - @nostrify/types@0.36.2

## 0.2.2

### Patch Changes

- fix package.json setup
- Updated dependencies
  - @nostrify/types@0.36.1

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.2.1 - 2025-02-06

### Fixed

- `optsFn` is called once per message instead of once at the start of execution.

## 0.2.0 - 2025-01-24

### Changed

- Accept a factory function to the second argument instead of an object.

## 0.1.1 - 2025-01-22

### Fixed

- Emit errors as NIP-01 messages instead of crashing the plugin.

## 0.1.0 - 2025-01-22

### Added

- Initital release
