# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[unreleased]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.17.1...HEAD
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
