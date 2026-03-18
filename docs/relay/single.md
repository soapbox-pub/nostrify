# Single Relay

The `NRelay1` class manages a connection to a single relay, automatically reconnecting if the connection is lost.

## Usage

Instantiate it with a WebSocket URL, and then loop over the messages:

```ts
const relay = new NRelay1('wss://relay.mostr.pub');

for await (const msg of relay.req([{ kinds: [1] }])) {
  if (msg[0] === 'EVENT') console.log(msg[2]);
  if (msg[0] === 'EOSE') break; // Sends a `CLOSE` message to the relay.
}
```

If the WebSocket disconnects, it will reconnect automatically thanks to the wonderful [websocket-ts](https://github.com/jjxxs/websocket-ts) library.
Upon reconnection, it will automatically re-subscribe to all subscriptions.

## Options

All options are optional.

- `auth` - A function like `(challenge: string) => Promise<NostrEvent>`. If provided, it will be called whenever the relay sends an `AUTH` message, and then it will send the resulting event back to the relay in an `AUTH` message. If not provided, auth is ignored.
- `backoff` - A [`Backoff`](https://github.com/jjxxs/websocket-ts/blob/v2.1.5/src/backoff/backoff.ts) object for reconnection attempts, or `false` to disable automatic reconnect. Default is `new ExponentialBackoff(1000)`.
- `idleTimeout` - How long to wait (in milliseconds) for the caller to create a subscription before closing the connection. Set to `false` to disable. Default is `30_000`.
- `verifyEvent` - Custom event verification function. Default is `nostrTools.verifyEvent`.
- `log` - Logger callback for debugging. Receives an object with `level`, `ns`, and context-specific fields.
- `fetch` - Custom fetch function for retrieving NIP-11 relay information. Default is `globalThis.fetch`.
