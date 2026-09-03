# Changelog

## 0.37.1

### Patch Changes

- 9d422a5: Drop dependencies that were never needed at runtime.

  `@nostrify/nostrify` pulled in `@smithy/util-base64` and `@smithy/util-hex-encoding`
  — AWS SDK internals — for four function calls. `@scure/base` was already a direct
  dependency and does the same job, so the imports now come from there and five packages
  leave the tree.

  `@nostrify/db` listed `postgres` and `kysely-postgres-js` as dependencies, but
  `NPostgres` only ever imports `kysely`; the Postgres driver was reaching every consumer
  to serve the test suite. Both are devDependencies now, as is `@types/node` in
  `@nostrify/policies` and `@nostrify/seed`, neither of which references node types from
  its published declarations.

  No API changes. `N64.decodeEvent` renames its parameter and, because `@scure/base`
  validates more strictly than `@smithy` did, reports malformed base64 with a different
  message than before.

- Updated dependencies [9d422a5]
  - @nostrify/nostrify@0.55.1

## 0.37.0

### Minor Changes

- a4443aa: Remove `OpenAIPolicy`.

  The policy passed a `body` to `fetch` without setting `method`, so every request
  was a GET with a body — which `fetch` rejects with a `TypeError` before the
  request is ever sent. The surrounding `try`/`catch` turned that into
  `blocked: error analyzing content`, so the policy rejected 100% of the events it
  was configured to inspect. It also ignored the `fetch` option it documented,
  always calling the global.

### Patch Changes

- 0e4d54b: `DomainPolicy`: compare NIP-05 domains case-insensitively (and ignore a trailing
  dot), so `user@EVIL.COM` no longer walks past a blacklist of `evil.com` — DNS
  resolves both to the same host, and the lookup succeeded either way because
  `URL` folds the host itself. Blacklist and whitelist entries are folded the same
  way. Both list checks now run _before_ the NIP-05 lookup, so a rejected domain
  can't make the relay issue an HTTP request to a host of the event author's
  choosing.

  `AntiDuplicationPolicy`: key on a SHA-256 digest instead of a 32-bit
  `hashCode`. A 4-byte digest is cheap to find preimages for, so a spammer could
  seed the store with content colliding against a message they wanted suppressed
  and have it rejected for the whole `expireIn` window.

- ce68503: `HashtagPolicy`: don't throw on a tag with no value, and compare case-insensitively
  on both sides. An event carrying a bare `["t"]` tag crashed the policy with a
  `TypeError`, and a ban list entry containing uppercase never matched anything.

  `RegexPolicy`: strip the `g` and `y` flags from the supplied regex. `RegExp.test`
  advances `lastIndex` on those flags and resumes from it on the next call, so a
  policy built with e.g. `/spam/g` blocked the first matching event, allowed the
  second, and blocked the third.

- Updated dependencies [3521020]
- Updated dependencies [31806d9]
- Updated dependencies [d6cdac8]
- Updated dependencies [e867b2b]
- Updated dependencies [e7ed697]
- Updated dependencies [49df722]
- Updated dependencies [6642803]
- Updated dependencies [dcbc857]
- Updated dependencies [9034956]
  - @nostrify/nostrify@0.55.0

## 0.36.32

### Patch Changes

- a7390f5: Build zod schemas once instead of reconstructing them on every call, in `NIP05`,
  `NConnectSigner`, `N64`, `LNURL`, `BlossomUploader`, `NostrBuildUploader`,
  `NRelay1`'s NIP-11 parsing, and `DomainPolicy`. Constructing these schemas cost
  far more than parsing with them, so the affected calls are 60-600x cheaper.

  `LNURL.lnurlDetailsSchema()` and `LNURL.lnurlCallbackSchema()` remain methods with
  the same signatures, and are now memoized internally.

- Updated dependencies [a7390f5]
- Updated dependencies [7d8e193]
- Updated dependencies [46d3e0e]
  - @nostrify/nostrify@0.54.1

## 0.36.31

### Patch Changes

- Updated dependencies [9ab9e73]
- Updated dependencies
  - @nostrify/nostrify@0.54.0

## 0.36.30

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.53.0

## 0.36.29

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.52.2

## 0.36.28

### Patch Changes

- Updated dependencies [e55aa19]
  - @nostrify/nostrify@0.52.1

## 0.36.27

### Patch Changes

- Updated dependencies [693754a]
  - @nostrify/nostrify@0.52.0
  - @nostrify/types@0.37.0

## 0.36.26

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.51.1

## 0.36.25

### Patch Changes

- Updated dependencies [a9dc610]
  - @nostrify/nostrify@0.51.0

## 0.36.24

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.50.5

## 0.36.23

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.50.4

## 0.36.22

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.50.3

## 0.36.21

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.50.2

## 0.36.20

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.50.1

## 0.36.19

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.50.0

## 0.36.18

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.49.2

## 0.36.17

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.49.1

## 0.36.16

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.49.0

## 0.36.15

### Patch Changes

- Fix TypeScript import errors by removing source .ts files from dist directory
- Updated dependencies
  - @nostrify/types@0.36.9
  - @nostrify/nostrify@0.48.3

## 0.36.14

### Patch Changes

- Implement type checking in CI for all libs.
- Updated dependencies
  - @nostrify/nostrify@0.48.2
  - @nostrify/types@0.36.8

## 0.36.13

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.48.1

## 0.36.12

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.48.0

## 0.36.11

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.47.1

## 0.36.10

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.47.0

## 0.36.9

### Patch Changes

- export js files instead of TS files
- Updated dependencies
  - @nostrify/nostrify@0.46.11
  - @nostrify/types@0.36.7

## 0.36.8

### Patch Changes

- distribute ts files
- Updated dependencies
  - @nostrify/nostrify@0.46.10
  - @nostrify/types@0.36.6

## 0.36.7

### Patch Changes

- tests should pass now
- Updated dependencies
  - @nostrify/nostrify@0.46.9
  - @nostrify/types@0.36.5

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
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.36.2 - 2025-06-06

### Fixed

- DomainPolicy blacklist now includes subdomains.

## 0.36.1 - 2024-10-09

### Fixed

- WoTPolicy: fix unhandled promise rejection by delaying getPubkeys until the
  first call.

## 0.36.0 - 2024-09-25

### Added

- Added WoTPolicy to whitelist follows of follows.

## 0.35.0 - 2024-09-23

### Added

- AntiDuplicationPolicy: added `deobfuscate` option to pre-process event content
  before taking the hash.

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

- BREAKING: OpenAIPolicy: Removed `timeout` opt. It now accept a `signal` in its
  `call` method.

## 0.31.0 - 2024-09-09

### Added

- Initial release of `@nostrify/policies`, moved from
  `@nostrify/nostrify/policies`.
