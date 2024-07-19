# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.26.2] - 2024-07-18

### Fixed

- NDatabase: use unambiguous column names in queries.

## [0.26.1] - 2024-07-17

### Fixed

- NDatabase: fix order of results when the results length exceeds the limit.

## [0.26.0] - 2024-07-16

### Changed

- BREAKING: NPool: remove `reqRelays` option, add `reqRouter`. Rename `eventRelays` to `eventRouter`.

## [0.25.0] - 2024-06-29

### Added

- NDatabase: add `timeout` option to methods for Postgres.

## [0.24.0] - 2024-06-27

### Added

- NDatabase: add `transaction` method.

## [0.23.3] - 2024-06-17

### Fixed

- NDatabase: add intrinsic limits to filters when applicable, skip 0 limit filters.

## [0.23.2] - 2024-06-13

### Fixed

- NDatabase: fix querying by multiple tags.

## [0.23.1] - 2024-06-09

### Fixed

- NDatabase: improve performance of `ids` queries.

## [0.23.0] - 2024-06-07

### Added

- NDatabase: support replaceable event deletions.

## [0.22.5] - 2024-06-01

### Fixed

- NSchema: `created_at` must be a nonnegative integer.
- Upgrade `nostr-tools` to v2.7.0, remove dependency on `@noble/hashes`.
- NostrBuildUploader: don't set `dim` tag if nostr.build returns 0 dimensions.

## [0.22.4] - 2024-05-24

### Changed

- Upgrade zod to v3.23.8.

## [0.22.3] - 2024-05-24

### Added

- NostrMetadata: added `display_name` and `bot` fields.
- NSchema: added `display_name` and `bot` fields to `n.metadata()`.

### Fixed

- NostrMetadata: added `website` field so `NSchema.metadata()` returns the correct type.

### Changed

- NSchema: stricter validation of `nip05` as an email-like address.
- NSchema: stricter validation of `lud06` as a bech32 address.
- NSchema: stricter validation of `lud16` as an email-like address.
- NSchema: stricter validation of `picture` and `banner` as URLs.

## [0.22.2] - 2024-05-24

### Added

- NSchema: parse `lud16` more strictly, add `website`.

## [0.22.1] - 2024-05-23

### Added

- Added `HashtagPolicy` to block events with specific hashtags.

## [0.22.0] - 2024-05-19

### Added

- `NUploader` interface and two uploader classes under `@nostrify/nostrify/uploaders`.
- Blossom uploader (`BlossomUploader`) to upload files to Blossom servers.
- nostr.build uploader (`NostrBuildUploader`) to upload files to nostr.build.
- `NIP98` module to verify NIP-98 Requests.

## [0.21.1] - 2024-05-18

### Changed

- NConnectSigner: don't automatically guess the decryption method.

## [0.21.0] - 2024-05-18

### Added

- NConnectSigner: NIP-44 encryption support by setting `{ encryption: 'nip44' }` in the constructor.

### Fixed

- NDatabase: Postgres FTS now correctly uses the `searchText` option to create the search index.

## [0.20.0] - 2024-05-16

### Added

- NDatabase: Postgres full-text search (FTS) support.

### Changed

- BREAKING: NDatabase `fts5` option has been renamed to `fts`, and now accepts a string of either `'sqlite'` or `'postgres'`.

## [0.19.2] - 2024-05-16

### Fixed

- NDatabase: fix crash with mixed tag filters.

## [0.19.1] - 2024-05-16

### Fixed

- NDatabase: fix deleting everything for the author when they delete a single event.

## [0.19.0] - 2024-05-13

### Fixed

- Improved performance of NDatabase when querying replaceable events by author.
- NConnect.signEvent now throws if the connect message was rejected by the relay.

## [0.18.0] - 2024-05-04

### Added

- Added `NSimplePool` class based on SimplePool from nostr-tools.

## [0.17.1] - 2024-04-29

Redeploy to JSR (to hopefully fix [npm compatibility](https://github.com/jsr-io/jsr/issues/446)).

## [0.17.0] - 2024-04-28

### Changed

- BREAKING: change `NRelay.req` return type from an AsyncGenerator to an AsyncIterable.

## [0.16.0] - 2024-04-25

### Changed

- BREAKING: moved export of `NDenoKv` to `@nostrify/nostrify/denokv`.

## [0.15.0] - 2024-04-25

### Changed

- BREAKING: changed exports of `LNURL`, `Machina`, and `MockRelay` classes.

## [0.14.3] - 2024-04-24

### Fixed

- `NConnectSigner` now closes subscriptions between each call.

## [0.14.2] - 2024-04-24

### Fixed

- `NConnectSigner` - fixed race condition between sending messages and receiving responses.

## [0.14.1] - 2024-04-24

### Changed

- Upgrade `zod` to v3.23.4.

## [0.14.0] - 2024-04-24

### Fixed

- BREAKING: fixed `NConnectSigner.connect` method signature (it doesn't need to accept a pubkey).

## [0.13.0] - 2024-04-24

### Added

- Added Nostr Connect (NIP-46) signer class, `NConnectSigner`.

## [0.12.1] - 2024-04-22

### Added

- Added `InvertPolicy` to take the opposite result of a policy.

## [0.12.0] - 2024-04-22

### Added

- Added `AnyPolicy` policy, a pipeline policy which rejects only if all policies reject.

### Changed

- BREAKING: Renamed `PipelinePolicy` to `PipePolicy.

## [0.11.0] - 2024-04-22

### Added

- Added moderation policies. Including the `NPolicy` interface and several policies.

## [0.10.2] - 2024-04-21

### Added

- Added Nostr client messages to `NSchema`.
- Exported `Machina` class to convert callbacks into AsyncGenerators.

### Fixed

- `NRelay1.count` now works.

## [0.10.1] - 2024-04-19

### Removed

- BREAKING: Removed `close()` method from `NDenoKv` class.

## [0.10.0] - 2024-04-19

### Added

- Added `NDenoKv` storage class, for storing events in Deno KV.

[unreleased]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.26.2...HEAD
[0.26.2]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.26.1...v0.26.2
[0.26.1]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.26.0...v0.26.1
[0.26.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.25.0...v0.26.0
[0.25.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.24.0...v0.25.0
[0.24.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.23.3...v0.24.0
[0.23.3]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.23.2...v0.23.3
[0.23.2]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.23.1...v0.23.2
[0.23.1]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.23.0...v0.23.1
[0.23.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.22.5...v0.23.0
[0.22.5]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.22.4...v0.22.5
[0.22.4]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.22.3...v0.22.4
[0.22.3]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.22.2...v0.22.3
[0.22.2]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.22.1...v0.22.2
[0.22.1]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.22.0...v0.22.1
[0.22.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.21.1...v0.22.0
[0.21.1]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.21.0...v0.21.1
[0.21.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.20.0...v0.21.0
[0.20.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.19.2...v0.20.0
[0.19.2]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.19.1...v0.19.2
[0.19.1]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.19.0...v0.19.1
[0.19.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.18.0...0.19.0
[0.18.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.17.1...0.18.0
[0.17.1]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.17.0...0.17.1
[0.17.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.16.0...0.17.0
[0.16.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.15.0...0.16.0
[0.15.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.14.3...0.15.0
[0.14.3]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.14.2...v0.14.3
[0.14.2]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.14.1...v0.14.2
[0.14.1]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.14.0...v0.14.1
[0.14.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.13.0...v0.14.0
[0.13.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.12.1...v0.13.0
[0.12.1]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.12.0...v0.12.1
[0.12.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.11.0...v0.12.0
[0.11.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.10.2...v0.11.0
[0.10.2]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.10.1...v0.10.2
[0.10.1]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.10.0...v0.10.1
[0.10.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.9.7...v0.10.0
[0.9.7]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.9.6...v0.9.7
[0.9.6]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.9.5...v0.9.6
[0.9.5]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.9.4...v0.9.5
[0.9.4]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.9.3...v0.9.4
[0.9.3]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.9.2...v0.9.3
[0.9.2]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.9.1...v0.9.2
[0.9.1]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.9.0...v0.9.1
[0.9.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.8.1...v0.9.0
[0.8.1]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.8.0...v0.8.1
[0.8.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.7.0...v0.8.0
[0.7.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.6.0...v0.7.0
[0.6.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.5.0...v0.6.0
[0.5.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.4.0...v0.5.0
[0.4.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.3.0...v0.4.0
[0.3.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.2.0...v0.3.0
[0.2.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.1.0...v0.2.0
[0.1.0]: https://gitlab.com/soapbox-pub/nostrify/-/tags/v0.1.0
