# Relays

Nostrify provides a [relay](/relay/single) and a [pool](/relay/pool) with a simple interface.

```ts
for await (const msg of relay.req([{ kinds: [1, 6] }])) {
  if (msg[0] === 'EVENT') console.log(msg[2]);
  if (msg[0] === 'EOSE') break;
}
```

Relays on Nostrify are actually just another type of [storage](/store/).
They implement [`NRelay`](https://jsr.io/@nostrify/types/doc/~/NRelay) (which is based on [`NStore`](https://jsr.io/@nostrify/types/doc/~/NStore)). As a result, relays and storages are interchangeable in most cases.

```ts
// Normal `NStore` methods work on relays, too!

await relay.event(event); // Insert an event
const events = await relay.query({ kinds: [0] }); // Get events
```

## Usage

Most Nostr libraries use callbacks to stream data from relays. Nostrify uses [AsyncGenerator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncGenerator)s instead, which are more powerful and easier to use.

Messages are streamed in a for-loop when calling `.req()`. This method returns an async generator that yields [NIP-01 messages](https://jsr.io/@nostrify/types/doc/~/NostrRelayMsg) from the relay. Breaking out of the loop closes the subscription automatically.

```ts
for await (const msg of relay.req([{ kinds: [0] }])) {
  console.log(msg);
  break; // <- This sends a `CLOSE` message to the relay automatically!
}
```

You can also cancel a subscription with an [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal).

```ts
const controller = new AbortController();
const signal = controller.signal;

const subscription = relay.req([{ kinds: [0] }], { signal });

// Later...

controller.abort(); // <- This sends a `CLOSE` message to the relay
```

> [!TIP]
> You should pass a `signal` into relay methods, or they will be allowed to run forever.
> All relay methods accept a signal in the second argument.

## Implementations

- [`NRelay1`](/relay/single) - Manages a connection to a single relay, automatically reconnecting if the connection is lost.

- [`NPool`](/relay/pool) - Manages a pool of relays, designed with the Outbox model in mind.

## Custom Relays

You can create your own relay by implementing the [`NRelay`](https://jsr.io/@nostrify/types/doc/~/NRelay) interface. This allows you to connect to a relay however you choose.

```ts
import { NostrEvent, NostrFilter, NostrRelayMsg, NRelay } from '@nostrify/nostrify';

class MyRelay implements NRelay {
  async *req(filters: NostrFilter[], { signal }: { signal?: AbortSignal } = {}): AsyncIterable<NostrRelayMsg> {
    // Stream messages from the relay.
  }

  async event(event: NostrEvent): Promise<void> {
    // Insert an event.
  }

  async query(filters: NostrFilter[]): Promise<NostrEvent[]> {
    // Query events.
  }
}
```