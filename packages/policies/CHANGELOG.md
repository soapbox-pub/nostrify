# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

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
