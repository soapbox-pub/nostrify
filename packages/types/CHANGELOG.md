# Changelog

## 0.37.0

### Minor Changes

- 693754a: NSchema: stricter validation and NIP-11 spec coverage.

  - `n.event()` and `n.filter()` now enforce the documented `kind` upper bound of `65535`.
  - `n.filter()` now rejects unrecognized top-level keys (e.g. `seenOn`) instead of silently dropping them. `#`-prefixed tag filters continue to pass through. Callers that were relying on the lenient behavior should strip application-specific fields before validating.
  - `n.bech32(prefix)` now returns a helpful error message when the prefix doesn't match (e.g. `Expected bech32 prefix "npub1"`).
  - `n.relayInfo()` (and `NostrRelayInfo`) now cover the NIP-11 spec fields that were previously missing: `banner`, `self`, `terms_of_service`, and `limitation.default_limit`.
  - Removed a redundant no-op `.required({...})` call from `n.event()`.

## 0.36.9

### Patch Changes

- Fix TypeScript import errors by removing source .ts files from dist directory

## 0.36.8

### Patch Changes

- Implement type checking in CI for all libs.

## 0.36.7

### Patch Changes

- export js files instead of TS files

## 0.36.6

### Patch Changes

- distribute ts files

## 0.36.5

### Patch Changes

- tests should pass now

## 0.36.4

### Patch Changes

- Get tests passing in CI, use esbuild to build final JS files

## 0.36.3

### Patch Changes

- fix imports in workspace packages

## 0.36.2

### Patch Changes

- Fix typescript config so it outputs ESM not CJS built files

## 0.36.1

### Patch Changes

- fix package.json setup

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

## 0.36.0 - 2024-12-30

### Changed

- Remove `WebSocket['url']` from types in favor of `string`.

## 0.35.0 - 2024-09-23

### Added

- Added NIP-11 `NostrRelayInfo` type.
- NPolicy: added `info` getter that optionally returns a `NostrRelayInfo` object.
- BREAKING: NRelay: added a required `.close()` method.

## 0.30.1 - 2024-09-09

### Changed

- NPolicy now accepts an optional AbortSignal to its `call` method.

## 0.30.0 - 2024-08-05

### Added

- Initial release as a standalone package. Previously part of `jsr:@nostrify/nostrify`.
