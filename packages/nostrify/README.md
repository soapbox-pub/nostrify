# Nostrify

Bring your projects to life on Nostr. 🌱

Nostrify is a Nostr framework for web browsers and Deno. It's made up of of simple modules that can be used independently, or swapped out with your own implementations.

Use it alongside nostr-tools, NDK, or your existing application. Nostrify can be gradually adopted and plays nice with others.

## Schema

A suite of [zod](https://github.com/colinhacks/zod) schemas for Nostr are available in the `NSchema` module.

```ts
import { NSchema as n } from '@nostrify/nostrify';

const event: NostrEvent = n.event().parse(eventData);
const metadata: NostrMetadata = n.json().pipe(n.metadata()).parse(event.content);
const msg: NostrRelayMsg = n.relayMsg().parse(e.data);
const nsec: `nsec1${string}` = n.bech32('nsec').parse(token);
```

## Storages

Storages (implementing the `NStore` interface) allow interacting with Nostr events.
A database is a Storage. A relay is a Storage. A cache is a Storage.
It should be possible to use Nostr storages interchangeably to get the best performance.

### `NStore` interface

`NStore` is the interface that all Nostr Storages implement.

```ts
/** Nostr event store. */
interface NStore {
  /** Add an event to the store (equivalent of `EVENT` verb). */
  event(event: NostrEvent, opts?: NStoreOpts): Promise<void>;
  /** Get an array of events matching filters. */
  query(filters: NostrFilter[], opts?: NStoreOpts): Promise<NostrEvent[]>;
  /** Get the number of events matching filters (equivalent of `COUNT` verb). */
  count?(filters: NostrFilter[], opts?: NStoreOpts): Promise<NostrRelayCOUNT[2]>;
  /** Remove events from the store. This action is temporary, unless a kind `5` deletion is issued. */
  remove?(filters: NostrFilter[], opts?: NStoreOpts): Promise<void>;
}
```

### `NCache` class

Nostr LRU cache based on [`npm:lru-cache`](https://www.npmjs.com/package/lru-cache).
It implements both `NStore` and `NSet` interfaces.

```ts
// Accepts the options of `npm:lru-cache`:
const cache = new NCache({ max: 1000 });

// Events can be added like a regular `Set`:
cache.add(event1);
cache.add(event2);

// Can be queried like `NStore`:
const events = await cache.query([{ kinds: [1] }]);

// Can be iterated like `NSet`:
for (const event of cache) {
  console.log(event);
}
```

### `NDatabase` class

SQLite database storage adapter for Nostr events.
It uses [Kysely](https://kysely.dev/) to make queries, making it flexible for a variety of use-cases.

```ts
// Create a Kysely instance.
const kysely = new Kysely({
  dialect: new DenoSqliteDialect({
    database: new Sqlite('./db.sqlite3'),
  }),
});

// Pass Kysely into the constructor.
const db = new NDatabase(kysely);

// Migrate the database before use.
await db.migrate();

// Now it's just a regular storage.
await db.event(event1);
await db.event(event2);
const events = await db.query([{ kinds: [1] }]);
```

### `NSet` class (not really a storage)

Nostr event implementation of the `Set` interface.

NSet is an implementation of the theory that a Nostr Storage is actually just a Set.
Events are Nostr's only data type, and they are immutable, making the Set interface ideal.

```ts
const events = new NSet();

// Events can be added like a regular `Set`:
events.add(event1);
events.add(event2);

// Can be iterated:
for (const event of events) {
  if (matchFilters(filters, event)) {
    console.log(event);
  }
}
```

`NSet` will handle kind `5` deletions, removing events from the set.
Replaceable (and parameterized) events will keep only the newest version.
However, verification of `id` and `sig` is NOT performed.

Any `Map` instance can be passed into `new NSet()`, making it compatible with
[lru-cache](https://www.npmjs.com/package/lru-cache), among others.

## Relays

Relays are an extended form of Storage with real-time streaming capabilities.

### `NRelay` interface

`NRelay` implements all the methods of `NStore`, including a `req` method for streaming events.

```ts
interface NRelay extends NStore {
  /** Subscribe to events matching the given filters. Returns an iterator of raw NIP-01 relay messages. */
  req(filters: NostrFilter[], opts?: NReqOpts): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED>;
}
```

The `req` method returns raw NIP-01 relay messages, but only those pertaining to subscriptions: `EVENT`, `EOSE`, and `CLOSED`.

Other messages such as `COUNT` and `OK` are handled internally by `NStore` methods:

- `NRelay.event` - sends an `EVENT` and waits for an `OK`. If the `OK` is false, an error is thrown with the reason as its message.
- `NRelay.query` - calls `NRelay.req` internally, closing the subscription automatically on `EOSE`.
- `NRelay.count` - sends a `COUNT` and waits for the response `COUNT`.
- `NRelay.remove` - not applicable.

Other notes:

- `AUTH` is not part of the interface, and should be handled by the implementation using an option in the constructor (see the `NRelay` class below).
- Using a `break` statement in the `req` loop will close the subscription automatically, sending a `CLOSE` message to the relay. This works thanks to special treatment of `try...finally` blocks by AsyncIterables.
- Passing an `AbortSignal` into the `req` method will also close the subscription automatically when the signal aborts, sending a `CLOSE` message.

### `NRelay1` class

The main `NRelay` implementation for connecting to one relay.
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

#### `NRelay1Opts` interface

All options are optional.

- `auth` - A function like `(challenge: string) => Promise<NostrEvent>`. If provided, it will be called whenever the relay sends an `AUTH` message, and then it will send the resulting event back to the relay in an `AUTH` message. If not provided, auth is ignored.
- `backoff` - A [`Backoff`](https://github.com/jjxxs/websocket-ts/blob/v2.1.5/src/backoff/backoff.ts) object for reconnection attempts, or `false` to disable automatic reconnect. Default is `new ExponentialBackoff(1000)`.
- `verifyEvent` - Custom event verification function. Default is `nostrTools.verifyEvent`.

### `NPool` class

The `NPool` class is a `NRelay` implementation for connecting to multiple relays.

```ts
const pool = new NPool({
  open: (url) => new NRelay1(url),
  reqRelays: async (filters) => ['wss://relay1.mostr.pub', 'wss://relay2.mostr.pub'],
  eventRelays: async (event) => ['wss://relay1.mostr.pub', 'wss://relay2.mostr.pub'],
});

// Now you can use the pool like a regular relay.
for await (const msg of pool.req([{ kinds: [1] }])) {
  if (msg[0] === 'EVENT') console.log(msg[2]);
  if (msg[0] === 'EOSE') break;
}
```

This class is designed with the Outbox model in mind.
Instead of passing relay URLs into each method, you pass functions into the contructor that statically-analyze filters and events to determine which relays to use for requesting and publishing events.
If a relay wasn't already connected, it will be opened automatically.
Defining `open` will also let you use any relay implementation, such as `NRelay1`.

Note that `pool.req` may stream duplicate events, while `pool.query` will correctly process replaceable events and deletions within the event set before returning them.

`pool.req` will only emit an `EOSE` when all relays in its set have emitted an `EOSE`, and likewise for `CLOSED`.

#### `NPoolOpts` interface

- `open` - A function like `(url: string) => NRelay`. This function should return a new instance of `NRelay` for the given URL.

- `reqRelays` - A function like `(filters: NostrFilter[]) => Promise<string[]>`. This function should return an array of relay URLs to use for making a REQ to the given filters. To support the Outbox model, it should analyze the `authors` field of the filters.

- `eventRelays` - A function like `(event: NostrEvent) => Promise<string[]>`. This function should return an array of relay URLs to use for publishing an EVENT. To support the Outbox model, it should analyze the `pubkey` field of the event.

Pro-tip: the `url` parameter is a unique relay identifier (string), and doesn't technically _have_ to be a URL, as long as you handle it correctly in your `open` function.

## Signers

Signer, like storages, should be usable in an interoperable/composable way.
The foundation of this is NIP-07.

### `NostrSigner` interface

The `NostrSigner` interface is pulled right out of NIP-07.
This means any signer implementing it can be used as a drop-in replacement for `window.nostr`.
Since NIP-07 functions don't accept many options, new Signers are created by abusing constructor props.

```ts
/** NIP-07 Nostr signer. */
interface NostrSigner {
  /** Returns a public key as hex. */
  getPublicKey(): Promise<string>;
  /** Takes an event template, adds `id`, `pubkey` and `sig` and returns it. */
  signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent>;
  /** Returns a record of relay URLs to relay policies. */
  getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>;
  /** @deprecated NIP-04 crypto methods. Use `nip44` instead. */
  nip04?: {
    /** @deprecated Returns ciphertext and iv as specified in NIP-04. */
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    /** @deprecated Takes ciphertext and iv as specified in NIP-04. */
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
  /** NIP-44 crypto methods. */
  nip44?: {
    /** Returns ciphertext as specified in NIP-44. */
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    /** Takes ciphertext as specified in NIP-44. */
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}
```

### `NSecSigner` class

NIP-07-compatible signer with secret key. It is a drop-in replacement for `window.nostr`.

Usage:

```ts
const signer = new NSecSigner(secretKey);
const pubkey = await signer.getPublicKey();
const event = await signer.signEvent({ kind: 1, content: 'Hello, world!', tags: [], created_at: 0 });
```

### `NSeedSigner` class

Accepts an HD seed which it uses to derive the secret key according to [NIP-06](https://github.com/nostr-protocol/nips/blob/master/06.md).
This method is useful for supporting multiple accounts for the same user, or for sharing a Nostr account with a Bitcoin wallet.

```ts
const signer = new NSeedSigner(seed, 0);

signer.getPublicKey();
signer.signEvent(t);
```

### `NPhraseSigner` class

Similar to `NSeedSigner`, but accepts a BIP-39 mnemonic phrase which it converts into a seed before usage.

```ts
const signer = new NPhraseSigner('abandon baby cabbage dad ...', {
  account: 0, // Optional account number. Default is 0.
  passphrase: 'very special mother', // Optional passphrase. Default is no passphrase.
});

signer.getPublicKey();
signer.signEvent(t);
```

### `NCustodial` class

Signer manager for multiple users.
Pass a shared secret into it, then it will generate keys for your users determinstically.
Useful for custodial auth where you only want to manage one secret for the entire application.

```ts
const SECRET_KEY = Deno.env.get('SECRET_KEY'); // generate with `openssl rand -base64 48`
const seed = new TextEncoder().encode(SECRET_KEY);

const signers = new NCustodial(seed);

const alex = await signers.get('alex');
const fiatjaf = await signers.get('fiatjaf');

alex.getPublicKey();
fiatjaf.signEvent(t);
```

### `NConnectSigner` class

TODO

## License

MIT
