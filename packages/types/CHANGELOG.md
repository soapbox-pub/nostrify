# Changelog

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
