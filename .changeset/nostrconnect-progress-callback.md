---
"@nostrify/react": minor
---

Add an `onStatus` progress callback to `NLogin.fromNostrConnect`. Callers can now render live feedback as the NIP-46 client-initiated handshake advances through its two phases: `'awaiting-connect'` (waiting for the remote signer to publish its connect-ack on kind 24133) and `'getting-public-key'` (issuing the `get_public_key` RPC once the connect-ack arrives). This is particularly useful on mobile, where the browser is backgrounded while the signer app runs and a frozen login dialog is indistinguishable from a hang. Export the new `NostrConnectStatus` type from `@nostrify/react/login`.
