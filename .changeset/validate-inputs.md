---
'@nostrify/nostrify': minor
'@nostrify/seed': minor
'@nostrify/strfry': patch
---

Validate three inputs that were taken on trust.

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
