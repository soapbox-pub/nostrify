---
'@nostrify/nostrify': minor
'@nostrify/seed': major
---

Harden the signers and the HTTP auth helpers against inputs they were taking on
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
