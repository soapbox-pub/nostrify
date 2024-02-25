# NSpec

Low-level Nostr library with a focus on web standards.

## Usage

```ts
// Deno
import { NostrEvent, NSchema, NSet } from 'https://gitlab.com/soapbox-pub/NSpec/-/raw/v0.3.0/mod.ts';

// Node
import { NostrEvent, NSchema, NSet } from 'nspec';
```

## Schema

A suite of [zod](https://github.com/colinhacks/zod) schemas for Nostr are available in the `NSchema` module.

```ts
import { NSchema as n } from 'nspec';

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

### `NRelay` class

TODO

### `NPool` class

TODO

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

Similar to `NSecSigner`, but it accepts a BIP-39 mnemonic seed phrase which it uses to derive the secret key according to [NIP-06](https://github.com/nostr-protocol/nips/blob/master/06.md).

```ts
const signer = new NSeedSigner('abandon baby cabbage dad ...', {
  account: 0, // Optional account number. Default is 0.
  passphrase: 'very special mother', // Optional passphrase. Default is no passphrase.
});

const pubkey = await signer.getPublicKey();
const event = await signer.signEvent({ content: 'Hello, world!', kind: 1, ... });
```

### `NConnectSigner` class

TODO

## License

[MIT](./LICENSE)
