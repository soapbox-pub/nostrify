# Changelog

## 0.55.0

### Minor Changes

- 31806d9: `LNURL`: validate the addresses it fetches.

  - `fromLightningAddress` interpolated the name straight into the well-known
    path after an email-shaped check. LUD-16 limits a name to `a-z0-9-_.` (plus
    `+`), which is narrower than an email local part, and even that admits `..` —
    which `new URL` resolves as a step up the path. Names and domains are now
    checked against LUD-16's form, and the address is lowercased as LUD-16
    specifies.
  - Every URL an LNURL flow fetches must be https, or http for a `.onion` host,
    per LUD-01. This covers both the endpoint itself — which arrives bech32
    encoded, so it can decode to any string at all — and the `callback`, which is
    chosen by whichever server answered the first request and was previously
    fetched as given.

- e7ed697: `NIP98.verify`: bound `created_at` in both directions, and require the `payload`
  tag when payload validation is on.

  NIP-98 asks that `created_at` be "within a reasonable time window"; only the
  past was bounded, so a future-dated event had a negative age that never reached
  `maxAge` and a token minted with a `created_at` a year out was accepted forever.
  `maxAge` is now the tolerance in either direction.

  The `payload` check was skipped entirely when the tag was absent, which meant a
  `POST`/`PUT`/`PATCH` token bound only the URL and method — replayable against
  the same endpoint with any body. NIP-98 makes the tag a client-side SHOULD and
  the check a server-side MAY, so this is a policy choice, and `validatePayload`
  is now the knob for it: when on (still the default for `POST`, `PUT` and
  `PATCH`) the tag is required, and servers that must accept clients which omit it
  can pass `validatePayload: false`. A payload tag that is present is checked
  either way.

- 49df722: `NSchema.event()` now validates `sig` as 64 bytes of lowercase hex, matching
  NIP-01, instead of accepting any string (including `""`) while holding `id` and
  `pubkey` to the exact hex form. Added `NSchema.signature()` for the same check
  on its own.
- dcbc857: Harden the signers and the HTTP auth helpers against inputs they were taking on
  trust.

  - **`NCustodial` now requires a seed of at least 32 bytes.** HMAC takes a key of
    any length, so a truncated or empty secret — an unset environment variable,
    say — was imported without complaint and derived keys indistinguishable from
    real ones. This one secret sits behind every user of the application, so a
    weak one gives up all of them at once, silently. Applications already passing
    a properly generated secret are unaffected.
  - **`NConnectSigner.getPublicKey` validates the result.** It was returned
    verbatim, and it becomes the identity the application signs in as, so an
    `npub`, an empty string or an error message were all adopted as the user and
    failed somewhere later, reading as a different bug. `getRelays` likewise now
    holds its keys to `n.relayUrl()` rather than accepting any string.
  - **`NConnectSigner.connect` checks that the signer acknowledged.** The result
    was returned but never inspected, so a signer answering with an empty string,
    or with the result of some other request, was taken as connected. NIP-46
    allows either `ack` or the secret, so both pass and nothing else does.
  - **`NBrowserSigner.signEvent` verifies what the extension hands back**, which
    it previously only checked for the presence of `id`, `pubkey` and `sig`. The
    event is rebuilt from its NIP-01 fields before verifying: that normalizes what
    callers get back, and drops nostr-tools' `verifiedSymbol`, which `verifyEvent`
    honors as a cached result — an in-process signer can otherwise carry that
    symbol through an object spread and be taken at its word. `verifyEvent` is
    exposed as an option, defaulting to `nostrTools.verifyEvent`.
  - **`NSecSigner` copies the secret key** instead of aliasing the caller's array.
    It memoizes the pubkey, so a caller that zeroized its own copy after handing
    the key over — the responsible thing to do — left the signer reporting one
    pubkey and signing under another.
  - **`NIP98.verify` takes a `maxPayloadSize`.** Checking the `payload` tag means
    hashing the body, and hashing it means holding it. A signature proves only
    that somebody signed, and anyone can mint a keypair, so an unauthenticated
    caller could reach that point at will with a body of any size. The default
    is `Infinity`, preserving current behavior for servers that legitimately
    accept large uploads; anything exposed to untrusted callers should set it.
    The docstring also now states what `verify` does not do: authorization, and
    replay defense, which NIP-98 cannot provide on its own.
  - **`NIP05.lookup` bounds the response.** The identifier names the host, so
    resolving a user-supplied one points it at a server of their choosing, which
    was free to answer with a body that never ended. Adds a `maxSize` (default
    1 MiB) and a `timeout` (default 10s, superseded by `signal`), and rejects a
    non-2xx response instead of parsing the error page and failing as a JSON
    syntax error.

- 9034956: Validate three inputs that were taken on trust.

  - `BunkerURI` accepted any non-empty host as the remote-signer pubkey and any
    string as a relay URL. NIP-46 pubkeys are hex; the pubkey is the counterparty
    of every exchange on the connection, and the relay URLs get opened as
    WebSockets. Both are now checked, and a hex pubkey is folded to lowercase.
  - `NPhraseSigner` never checked the BIP-39 checksum, so a mistyped phrase
    derived a different account without complaint. Mnemonics are now validated
    against a wordlist, English by default and configurable via the new
    `wordlist` option.
  - `strfry()` read `msg.event.id` in its error handlers, so an input line
    carrying no event threw out of the read loop and stopped the plugin. Such
    lines are now skipped.

### Patch Changes

- 3521020: `BlossomUploader`: require the blob URL to be `http(s)`, both in the BUD-02 blob
  descriptor and in the BUD-08 `nip94` tags. The value is chosen by the upload
  server and leaves as the `url` tag of an attachment the app is about to put in a
  note, so `javascript:` and `data:` URLs are no longer passed along. Also
  documented what `scopeToServer` costs when it's off, per BUD-11's security
  note: one unscoped token goes to every configured server, and any of them can
  replay it against the others until it expires.
- d6cdac8: `NConnectSigner`: decrypt NIP-46 responses by looking at the ciphertext rather
  than at the `encryption` option, and surface a response that can't be read
  instead of waiting out the timeout.

  `encryption` is documented as governing outbound messages only — "Decryption is
  automatic" — but `decrypt()` dispatched on it just as `encrypt()` did. NIP-46
  lets a signer answer in either scheme no matter which one the request used, so a
  NIP-04 bunker talking to a client configured for NIP-44 could not be understood.
  A NIP-04 ciphertext ends in `?iv=<iv>`, and `?` is outside the base64 alphabet a
  NIP-44 payload is confined to, so the scheme is readable off the payload itself.

  Such a failure previously hung until the request timed out, with nothing to say
  why. Because the author is checked first, and forging that author means forging
  its signature, an unreadable payload can only be the signer we are connected to
  failing — which is worth reporting, so it now throws.

- e867b2b: `NConnectSigner`: only accept NIP-46 responses authored by the remote-signer
  pubkey, and verify that the event returned by `sign_event` is actually signed.

  The `authors` filter was the only thing keeping foreign events out, and the
  relay is both the party asked to honor it and the party best placed to ignore
  it. Anyone who has seen the REQ can address a kind 24133 to the ephemeral client
  pubkey, so check the author locally instead of assuming the filter was applied.
  `verifyEvent` is exposed as an option, defaulting to `nostrTools.verifyEvent`.

- 6642803: `NRelay1.event` now clears its pending-event bookkeeping when the publish
  settles, instead of only when an `OK` arrives — a relay that never answers, or
  an aborted signal, used to leave the event held for the lifetime of the
  connection.

  `CircularSet` evicted the oldest member only if it was truthy, so a set holding
  `''` or `0` could grow past its capacity.

  `NostrBuildUploader` no longer logs the upload response to the console.

## 0.54.1

### Patch Changes

- a7390f5: Build zod schemas once instead of reconstructing them on every call, in `NIP05`,
  `NConnectSigner`, `N64`, `LNURL`, `BlossomUploader`, `NostrBuildUploader`,
  `NRelay1`'s NIP-11 parsing, and `DomainPolicy`. Constructing these schemas cost
  far more than parsing with them, so the affected calls are 60-600x cheaper.

  `LNURL.lnurlDetailsSchema()` and `LNURL.lnurlCallbackSchema()` remain methods with
  the same signatures, and are now memoized internally.

- 7d8e193: NRelay1: build the inbound message schema once instead of rebuilding it for every message.
- 46d3e0e: `NPool.query` and `NRelay1.query` no longer use `NSet` to collect results, which was
  re-sorting and rescanning the whole result set on every incoming event. Collecting
  100 events is now ~5x faster, and 1000 events ~40x faster.

  This also fixes an edge case: previously, when an event was rejected because a kind `5`
  deleted it, it could still evict the older version of the replaceable event it would
  have replaced, dropping both from the results.

## 0.54.0

### Minor Changes

- 9ab9e73: Upgrade BlossomUploader to the latest Blossom spec

### Patch Changes

- Treat any token decode failure as "Invalid token" in `NIP98.verify`.

## 0.53.0

### Minor Changes

- Add `dim` tag to `BlossomUploader` output when the Blossom blob descriptor includes valid image dimensions.

## 0.52.2

### Patch Changes

- Revert the change to NPool `eoseTimeout` that only started the timer after at least one event and an EOSE were received. This restores the previous behavior where the timer starts as soon as a relay sends EOSE.

## 0.52.1

### Patch Changes

- e55aa19: Fix NPool `eoseTimeout` to only start after at least one event has been received and a relay sends EOSE. Previously the timer started as soon as any relay sent EOSE, which could prematurely cancel relays that have results when an empty relay responded first.

## 0.52.0

### Minor Changes

- 693754a: NSchema: stricter validation and NIP-11 spec coverage.

  - `n.event()` and `n.filter()` now enforce the documented `kind` upper bound of `65535`.
  - `n.filter()` now rejects unrecognized top-level keys (e.g. `seenOn`) instead of silently dropping them. `#`-prefixed tag filters continue to pass through. Callers that were relying on the lenient behavior should strip application-specific fields before validating.
  - `n.bech32(prefix)` now returns a helpful error message when the prefix doesn't match (e.g. `Expected bech32 prefix "npub1"`).
  - `n.relayInfo()` (and `NostrRelayInfo`) now cover the NIP-11 spec fields that were previously missing: `banner`, `self`, `terms_of_service`, and `limitation.default_limit`.
  - Removed a redundant no-op `.required({...})` call from `n.event()`.

### Patch Changes

- Updated dependencies [693754a]
  - @nostrify/types@0.37.0

## 0.51.1

### Patch Changes

- Fix NPool.group() to propagate eoseTimeout from parent pool

## 0.51.0

### Minor Changes

- a9dc610: NRelay1: automatically retry REQ and EVENT after NIP-42 AUTH

  When a relay responds with `auth-required:` in a CLOSED or OK message, NRelay1 now waits for the AUTH flow to complete and re-sends the original request. This implements the full NIP-42 client-side protocol flow. Retries are limited to one attempt per subscription/event to prevent infinite loops.

## 0.50.5

### Patch Changes

- Fix NRelay1 and NPool to not enforce an inferred limit on coordinate filters. Filters targeting a single replaceable kind + single author, or a single addressable kind + single author + single `#d` tag, now allow relays to send back historical events instead of closing the subscription after receiving just one event.

## 0.50.4

### Patch Changes

- Republish with correct build artifacts.

## 0.50.3

### Patch Changes

- Fix NBrowserSigner to poll for extension availability instead of failing immediately. Handles the race condition where app code runs before the browser extension injects `window.nostr`.

## 0.50.2

### Patch Changes

- Fix NPool relay flooding by adding synchronous `performance.now()` checks on EOSE and EVENT messages. `setTimeout` can be starved when the event loop is saturated with WebSocket messages from a flooding relay, so synchronous time checks reliably abort when `eoseTimeout` has elapsed since the first EOSE.

## 0.50.1

### Patch Changes

- Fix eoseTimeout to only apply to `query()`, not `req()`. Previously, the EOSE timeout would abort streaming subscriptions via `req()` after the first relay sent EOSE, preventing callers from receiving events past EOSE.

## 0.50.0

### Minor Changes

- Add NIP-11 relay information document support to NRelay1 with `getRelayInfo()` method and `NSchema.relayInfo()` validation schema. Fix NRelay1.query to preserve relay-provided ordering for NIP-50 search filters instead of sorting by created_at.

## 0.49.2

### Patch Changes

- Simplify NSchema by removing explicit zod type annotations and leveraging type inference

## 0.49.1

### Patch Changes

- Upgrade zod dependency from v3 to v4

## 0.49.0

### Minor Changes

- Add configurable EOSE timeout to NPool to prevent slow relays from degrading query performance

  Added a new `eoseTimeout` option to `NPoolOpts` that starts a timer after the first relay sends EOSE. This prevents slow relays from blocking queries while still giving them reasonable time to respond.

  Key features:

  - Defaults to 1000ms timeout after first EOSE
  - Set to 0 to disable and wait for all relays (previous behavior)
  - Configurable via `eoseTimeout` in NPool constructor options

  This significantly improves query performance when using relay pools with varying response times.

## 0.48.3

### Patch Changes

- Fix TypeScript import errors by removing source .ts files from dist directory
- Updated dependencies
  - @nostrify/types@0.36.9

## 0.48.2

### Patch Changes

- Implement type checking in CI for all libs.
- Updated dependencies
  - @nostrify/types@0.36.8

## 0.48.1

### Patch Changes

- remove happy-dom dependency, fix improper test in NRelay1

## 0.48.0

### Minor Changes

- Remove all JSR imports

## 0.47.1

### Patch Changes

- rebuild package for NIP98Client member

## 0.47.0

### Minor Changes

- Add NIP98Client

## 0.46.11

### Patch Changes

- export js files instead of TS files
- Updated dependencies
  - @nostrify/types@0.36.7

## 0.46.10

### Patch Changes

- distribute ts files
- Updated dependencies
  - @nostrify/types@0.36.6

## 0.46.9

### Patch Changes

- tests should pass now
- Updated dependencies
  - @nostrify/types@0.36.5

## 0.46.8

### Patch Changes

- Get tests passing in CI, use esbuild to build final JS files
- Updated dependencies
  - @nostrify/types@0.36.4

## 0.46.7

### Patch Changes

- fix imports in workspace packages
- Updated dependencies
  - @nostrify/types@0.36.3

## 0.46.6

### Patch Changes

- Fix typescript config so it outputs ESM not CJS built files
- Updated dependencies
  - @nostrify/types@0.36.2

## 0.46.5

### Patch Changes

- fix package.json setup
- Updated dependencies
  - @nostrify/types@0.36.1

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.46.4 - 2025-07-15

### Fixed

- NConnectSigner: fixed REQ subscription not being opened before sending EVENT.

## 0.46.1 - 2025-05-14

### Fixed

- Fix fetch calls in browser by binding globalThis (NIP05, LNURL,
  BlossomUploader).
- BlossomUploader: use a browser-supported file hashing method.

## 0.46.0 - 2025-05-10

### Removed

- NRelay1: remove filter batching.

## 0.45.2 - 2025-05-10

### Fixed

- NRelay1: request batching only returned the first result.

## 0.45.1 - 2025-05-04

### Fixed

- NRelay1: fixed request batching.

## 0.45.0 - 2025-04-24

### Changed

- BREAKING: Redesign the `LNURL` module to be a stateful class, more similar to
  `URL`.

## 0.44.0 - 2025-04-23

### Changed

- NPool: wait for every type of filter, not just replaceable event filters.

## 0.43.0 - 2025-04-10

### Changed

- Moved `NSeedSigner`, `NPhraseSigner`, and `NCustodial` into a separate
  `@nostrify/seed` package.

## 0.42.1 - 2025-04-10

### Changed

- Upgrade `@scure/*` packages, switch them to jsr.

## 0.42.0 - 2025-04-10

### Added

- Added `@nostrify/react` package.
- NPool: add `.group` method to create sub-pools.

### Removed

- Removed NSimplePool.

## 0.41.2 - 2025-04-10

### Added

- Added `BunkerURI` class to parse NIP-46 connection strings.

## 0.41.1 - 2025-04-07

### Changed

- NKinds: deprecate `parameterizedReplaceable` in favor of `addressable`.

## 0.41.0 - 2025-04-07

### Added

- NRelay1: batch ids-only filters and filters for replaceable events by
  author/kind within the same event loop.

## 0.40.0 - 2025-03-26

### Added

- NPool: add `relays` opt to all methods to support per-query explicit relays.

### Changed

- NPool: deduplicate events in `.req` method.
- NPool: router opts may be synchronous.

### Fixed

- NPool: queries with `search` filters are no longer sorted by `created_at`.

## 0.39.1 - 2025-02-23

### Fixed

- NRelay1: improved error handling.

## 0.39.0 - 2025-02-22

### Added

- Added `RelayError` class.

### Fixed

- NRelay1: calling `.close()` cancels any active subscriptions.

### Changed

- NRelay1: upgraded websocket-ts to v2.2.1.
- NRelay1: close automatically upon receiving a binary message.
- NRelay1: pass url to all logs.

## 0.38.1 - 2025-02-05

### Changed

- NIP-50: parse negated tokens.

## 0.38.0 - 2025-01-30

### Added

- NRelay1: added relay logging.

## 0.37.0 - 2024-12-30

### Added

- NSchema: add `relayUrl` schema.

### Fixed

- NIP05: tolerate invalid documents, stricter validation of result.

### Changed

- NConnectSigner: use `nip44` encryption by default.

## 0.36.2 - 2024-11-24

### Fixed

- NSecSigner: cache pubkey to speed up subsequent `getPublicKey()` calls.

## 0.36.1 - 2024-10-10

### Fixed

- NRelay1: handle CLOSED response from COUNT.

## 0.36.0 - 2024-09-23

## Added

- NPool: add generic T extends NRelay.
- NPool: added `.relays` property.
- NRelay1: added `.subscriptions` property.

## 0.35.0 - 2024-09-23

### Added

- NPool: added a `.close()` method and support `await using` syntax.

### Fixed

- NPool: fixed routing of `.req()`.

## 0.32.0 - 2024-09-20

### Added

- NRelay1: added `idleTimeout` option to automatically close inactive
  connections.
- NRelay1: support `await using` syntax.

## 0.31.0 - 2024-09-09

### Added

- Added ReplyBotPolicy to block replies from bots in the same second.
- Added AuthorPolicy to reject events from authors without a kind 0, or with a
  particular kind 0.

### Changed

- BREAKING: Moved moderation policies to the `@nostrify/policies` package.
  Replace `@nostrify/nostrify/policies` with `@nostrify/policies` in your
  project.

### Fixed

- BlossomUploader: fixed Authorization header.

## 0.30.1 - 2024-08-27

### Fixed

- NPool: don't throw when the relay list is empty.

## 0.30.0 - 2024-08-05

### Added

- Converted Nostrify into a Deno workspace.
- BREAKING: NDatabase is now a standalone package, `@nostrify/db`.
- BREAKING: NDenoKv is now a standalone package, `@nostrify/denokv`.

## [0.29.0] - 2024-08-02

### Added

- NDatabase: implement streaming support with `.req`.

## [0.28.0] - 2024-07-29

### Fixed

- NDatabase: improved performance of all queries.

## [0.27.0] - 2024-07-29

### Fixed

- NDatabase: vastly improve performance of tag queries.

### Changed

- BREAKING: NDatabase: add kind, pubkey, and created_at columns to nostr_tags
  table. These columns are non-nullable, so the old database will need to be
  deleted or manually migrated.

## [0.26.3] - 2024-07-18

### Fixed

- NDatabase: order events by id after created_at.

## [0.26.2] - 2024-07-18

### Fixed

- NDatabase: use unambiguous column names in queries.

## [0.26.1] - 2024-07-17

### Fixed

- NDatabase: fix order of results when the results length exceeds the limit.

## [0.26.0] - 2024-07-16

### Changed

- BREAKING: NPool: remove `reqRelays` option, add `reqRouter`. Rename
  `eventRelays` to `eventRouter`.

## [0.25.0] - 2024-06-29

### Added

- NDatabase: add `timeout` option to methods for Postgres.

## [0.24.0] - 2024-06-27

### Added

- NDatabase: add `transaction` method.

## [0.23.3] - 2024-06-17

### Fixed

- NDatabase: add intrinsic limits to filters when applicable, skip 0 limit
  filters.

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

- NostrMetadata: added `website` field so `NSchema.metadata()` returns the
  correct type.

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

- `NUploader` interface and two uploader classes under
  `@nostrify/nostrify/uploaders`.
- Blossom uploader (`BlossomUploader`) to upload files to Blossom servers.
- nostr.build uploader (`NostrBuildUploader`) to upload files to nostr.build.
- `NIP98` module to verify NIP-98 Requests.

## [0.21.1] - 2024-05-18

### Changed

- NConnectSigner: don't automatically guess the decryption method.

## [0.21.0] - 2024-05-18

### Added

- NConnectSigner: NIP-44 encryption support by setting `{ encryption: 'nip44' }`
  in the constructor.

### Fixed

- NDatabase: Postgres FTS now correctly uses the `searchText` option to create
  the search index.

## [0.20.0] - 2024-05-16

### Added

- NDatabase: Postgres full-text search (FTS) support.

### Changed

- BREAKING: NDatabase `fts5` option has been renamed to `fts`, and now accepts a
  string of either `'sqlite'` or `'postgres'`.

## [0.19.2] - 2024-05-16

### Fixed

- NDatabase: fix crash with mixed tag filters.

## [0.19.1] - 2024-05-16

### Fixed

- NDatabase: fix deleting everything for the author when they delete a single
  event.

## [0.19.0] - 2024-05-13

### Fixed

- Improved performance of NDatabase when querying replaceable events by author.
- NConnect.signEvent now throws if the connect message was rejected by the
  relay.

## [0.18.0] - 2024-05-04

### Added

- Added `NSimplePool` class based on SimplePool from nostr-tools.

## [0.17.1] - 2024-04-29

Redeploy to JSR (to hopefully fix
[npm compatibility](https://github.com/jsr-io/jsr/issues/446)).

## [0.17.0] - 2024-04-28

### Changed

- BREAKING: change `NRelay.req` return type from an AsyncGenerator to an
  AsyncIterable.

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

- `NConnectSigner` - fixed race condition between sending messages and receiving
  responses.

## [0.14.1] - 2024-04-24

### Changed

- Upgrade `zod` to v3.23.4.

## [0.14.0] - 2024-04-24

### Fixed

- BREAKING: fixed `NConnectSigner.connect` method signature (it doesn't need to
  accept a pubkey).

## [0.13.0] - 2024-04-24

### Added

- Added Nostr Connect (NIP-46) signer class, `NConnectSigner`.

## [0.12.1] - 2024-04-22

### Added

- Added `InvertPolicy` to take the opposite result of a policy.

## [0.12.0] - 2024-04-22

### Added

- Added `AnyPolicy` policy, a pipeline policy which rejects only if all policies
  reject.

### Changed

- BREAKING: Renamed `PipelinePolicy` to `PipePolicy.

## [0.11.0] - 2024-04-22

### Added

- Added moderation policies. Including the `NPolicy` interface and several
  policies.

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

[unreleased]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.29.0...HEAD
[0.29.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.28.0...v0.29.0
[0.28.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.27.0...v0.28.0
[0.27.0]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.26.3...v0.27.0
[0.26.3]: https://gitlab.com/soapbox-pub/nostrify/-/compare/v0.26.2...v0.26.3
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
