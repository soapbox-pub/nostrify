---
'@nostrify/nostrify': patch
---

`NConnectSigner`: only accept NIP-46 responses authored by the remote-signer
pubkey, skip payloads that don't decrypt or parse instead of failing the whole
request, and verify that the event returned by `sign_event` is actually signed.

The `authors` filter was the only thing keeping foreign events out, and the
relay is both the party asked to honor it and the party best placed to ignore
it. Anyone who has seen the REQ can address a kind 24133 to the ephemeral client
pubkey, and one such event was previously enough to reject a pending request.
`verifyEvent` is exposed as an option, defaulting to `nostrTools.verifyEvent`.
