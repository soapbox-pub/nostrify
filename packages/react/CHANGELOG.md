# @nostrify/react

## 0.5.2

### Patch Changes

- Updated dependencies [693754a]
  - @nostrify/nostrify@0.52.0
  - @nostrify/types@0.37.0

## 0.5.1

### Patch Changes

- Improve nostrconnect:// reliability: remove `limit: 1` from the NIP-46 subscription filter and use `crypto.randomUUID()` for secret generation.

## 0.5.0

### Minor Changes

- Add pluggable async storage to NostrLoginProvider via the NLoginStorage interface, supporting both sync (localStorage) and async (eg. Capacitor Secure Storage) backends.

## 0.4.1

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.51.1

## 0.4.0

### Minor Changes

- Move react, react-dom, @tanstack/react-query, and nostr-tools from dependencies to peerDependencies to prevent duplicate React instances and support React 19

## 0.3.1

### Patch Changes

- Updated dependencies [a9dc610]
  - @nostrify/nostrify@0.51.0

## 0.3.0

### Minor Changes

- Add client-initiated NIP-46 (`nostrconnect://`) support

  - `NLogin.fromNostrConnect(params, pool, opts?)` — new static method for the client-initiated NIP-46 flow. The client generates ephemeral keys, displays a `nostrconnect://` URI (as a QR code or deep link), and waits for the remote signer to respond. Returns an `NLoginBunker` compatible with the existing session restoration in `NUser.fromBunkerLogin()`.
  - `generateNostrConnectParams(relays)` — generates an ephemeral keypair and random secret for a nostrconnect session.
  - `generateNostrConnectURI(params, opts?)` — builds the `nostrconnect://` URI string with relay, secret, name, and callback parameters.
  - `NostrConnectParams` and `NostrConnectURIOptions` types are exported.

## 0.2.31

### Patch Changes

- 5d93725: Fix NIP-46 bunker login: use `bunkerPubkey` instead of user pubkey when reconstructing `NConnectSigner`

  `NUser.fromBunkerLogin()` was passing `login.pubkey` (the user's pubkey) to `NConnectSigner` instead of `login.data.bunkerPubkey` (the bunker's pubkey). For signers where these differ (e.g. Primal Signer), all signing operations silently failed after page reload because NIP-46 requests were encrypted to the wrong key, p-tags pointed to the wrong recipient, and subscription filters listened for the wrong author.

## 0.2.30

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.50.5

## 0.2.29

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.50.4

## 0.2.28

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.50.3

## 0.2.27

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.50.2

## 0.2.26

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.50.1

## 0.2.25

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.50.0

## 0.2.24

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.49.2

## 0.2.23

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.49.1

## 0.2.22

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.49.0

## 0.2.21

### Patch Changes

- Fix TypeScript import errors by removing source .ts files from dist directory
- Updated dependencies
  - @nostrify/types@0.36.9
  - @nostrify/nostrify@0.48.3

## 0.2.20

### Patch Changes

- Implement type checking in CI for all libs.
- Updated dependencies
  - @nostrify/nostrify@0.48.2
  - @nostrify/types@0.36.8

## 0.2.19

### Patch Changes

- remove happy-dom dependency, fix improper test in NRelay1
- Updated dependencies
  - @nostrify/nostrify@0.48.1

## 0.2.18

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.48.0

## 0.2.17

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.47.1

## 0.2.16

### Patch Changes

- Updated dependencies
  - @nostrify/nostrify@0.47.0

## 0.2.15

### Patch Changes

- export js files instead of TS files
- Updated dependencies
  - @nostrify/nostrify@0.46.11
  - @nostrify/types@0.36.7

## 0.2.14

### Patch Changes

- distribute ts files
- Updated dependencies
  - @nostrify/nostrify@0.46.10
  - @nostrify/types@0.36.6

## 0.2.13

### Patch Changes

- tests should pass now
- Updated dependencies
  - @nostrify/nostrify@0.46.9
  - @nostrify/types@0.36.5

## 0.2.12

### Patch Changes

- Get tests passing in CI, use esbuild to build final JS files
- Updated dependencies
  - @nostrify/nostrify@0.46.8
  - @nostrify/types@0.36.4

## 0.2.11

### Patch Changes

- fix imports in workspace packages
- Updated dependencies
  - @nostrify/nostrify@0.46.7
  - @nostrify/types@0.36.3

## 0.2.10

### Patch Changes

- Fix typescript config so it outputs ESM not CJS built files
- Updated dependencies
  - @nostrify/nostrify@0.46.6

## 0.2.9

### Patch Changes

- fix package.json setup
- Updated dependencies
  - @nostrify/nostrify@0.46.5
