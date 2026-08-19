---
"@nostrify/react": patch
---

Enforce the handshake secret in `NLogin.fromNostrConnect`.

The client-initiated NIP-46 flow accepted a bare `"ack"` as an alternative to
the random `secret` it generated, then adopted the responding event's pubkey as
the bunker with no pinning. Because the subscription filter is
`{ kinds: [24133], '#p': [clientPubkey] }`, every relay that receives the REQ
learns the ephemeral client pubkey and can encrypt a `{"result":"ack"}` payload
to it — winning the race trivially, since the real signer is still waiting for
a human to scan a QR code and approve.

The secret exists precisely so that relays need not be trusted in this flow, so
only the generated secret is accepted now. `fromBunker` is unaffected: there the
counterparty is pinned by the `bunker://` URI before `connect()` runs, which is
why `"ack"` is legitimate in that flow.

Undecryptable or malformed kind-24133 payloads addressed to the client pubkey
are now skipped instead of aborting the handshake.
