# Relay Pool

The [`NPool`](https://jsr.io/@nostrify/nostrify/doc/~/NPool) class is an `NRelay` implementation for connecting to multiple relays.

## Usage

This class is designed with the [Outbox model](/relay/outbox) in mind.

Instead of passing relay URLs into each method, you pass functions into the constructor that statically-analyzes filters and events to determine which relays to use for requesting and publishing events.

```ts
const pool = new NPool({
  open(url) {
    return new NRelay1(url);
  },
  async reqRelays(filters) {
    return [/* Return an array of relay URLs. */];
  },
  async eventRelays(event) {
    return [/* Return an array of relay URLs. */];
  },
});

// Now you can use the pool like a regular relay.
for await (const msg of pool.req([{ kinds: [1] }])) {
  if (msg[0] === 'EVENT') console.log(msg[2]);
  if (msg[0] === 'EOSE') break;
}
```

> [!INFO]
>
> - If a relay wasn't already connected, it will be opened automatically. Defining `open` will also let you use any relay implementation, such as `NRelay1`.
> - `pool.req` may stream duplicate events, while `pool.query` will correctly process replaceable events and deletions within the event set before returning them.
> - `pool.req` will only emit an `EOSE` when all relays in its set have emitted an `EOSE`, and likewise for `CLOSED`.

## Options

- `open` - A function like `(url: string) => NRelay`. This function should return a new instance of `NRelay` for the given URL.

- `reqRelays` - A function like `(filters: NostrFilter[]) => Promise<string[]>`. This function should return an array of relay URLs to use for making a REQ to the given filters. To support the Outbox model, it should analyze the `authors` field of the filters.

- `eventRelays` - A function like `(event: NostrEvent) => Promise<string[]>`. This function should return an array of relay URLs to use for publishing an EVENT. To support the Outbox model, it should analyze the `pubkey` field of the event.

> [!TIP]
> The `url` parameter is a unique relay identifier (string), and doesn't technically _have_ to be a URL, as long as you handle it correctly in your `open` function.
