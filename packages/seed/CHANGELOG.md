# @nostrify/seed

## 0.44.1

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

## 0.44.0

### Minor Changes

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

## 0.43.20

### Patch Changes

- Updated dependencies [a7390f5]
- Updated dependencies [7d8e193]
- Updated dependencies [46d3e0e]
  - @nostrify/nostrify@0.54.1

## 0.43.19

### Patch Changes

- Updated dependencies [9ab9e73]
- Updated dependencies
  - @nostrify/nostrify@0.54.0

## 0.43.18

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.53.0

## 0.43.17

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.52.2

## 0.43.16

### Patch Changes

- Updated dependencies [e55aa19]
  - @nostrify/nostrify@0.52.1

## 0.43.15

### Patch Changes

- Updated dependencies [693754a]
  - @nostrify/nostrify@0.52.0

## 0.43.14

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.51.1

## 0.43.13

### Patch Changes

- Updated dependencies [a9dc610]
  - @nostrify/nostrify@0.51.0

## 0.43.12

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.50.5

## 0.43.11

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.50.4

## 0.43.10

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.50.3

## 0.43.9

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.50.2

## 0.43.8

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.50.1

## 0.43.7

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.50.0

## 0.43.6

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.49.2

## 0.43.5

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.49.1

## 0.43.4

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.49.0

## 0.43.3

### Patch Changes

- Fix TypeScript import errors by removing source .ts files from dist directory
- Updated dependencies
  - @nostrify/nostrify@0.48.3

## 0.43.2

### Patch Changes

- Implement type checking in CI for all libs.
- Updated dependencies
  - @nostrify/nostrify@0.48.2

## 0.43.1

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.48.1

## 0.43.0

### Minor Changes

- Remove all JSR imports

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.48.0

## 0.42.9

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.47.1

## 0.42.8

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.47.0

## 0.42.7

### Patch Changes

- export js files instead of TS files
- Updated dependencies
  - @nostrify/nostrify@0.46.11

## 0.42.6

### Patch Changes

- distribute ts files
- Updated dependencies
  - @nostrify/nostrify@0.46.10

## 0.42.5

### Patch Changes

- tests should pass now
- Updated dependencies
  - @nostrify/nostrify@0.46.9

## 0.42.4

### Patch Changes

- Get tests passing in CI, use esbuild to build final JS files
- Updated dependencies
  - @nostrify/nostrify@0.46.8

## 0.42.3

### Patch Changes

- fix imports in workspace packages
- Updated dependencies
  - @nostrify/nostrify@0.46.7

## 0.42.2

### Patch Changes

- Fix typescript config so it outputs ESM not CJS built files
- Updated dependencies
  - @nostrify/nostrify@0.46.6

## 0.42.1

### Patch Changes

- fix package.json setup
- Updated dependencies
  - @nostrify/nostrify@0.46.5
