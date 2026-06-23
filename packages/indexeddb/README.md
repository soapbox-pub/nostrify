# Nostrify IndexedDB

This package offers `NIndexedDB`, a general-purpose Nostr storage (`NStore`) backed by [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), suitable as a persistent client-side cache in the browser.

It is a TypeScript port of [strfry](https://github.com/hoytech/strfry)'s LMDB query engine onto IndexedDB, supporting arbitrary Nostr filters (`ids`, `authors`, `kinds`, single- and multi-letter tag filters, `since`/`until`, `limit`, `search`), replaceable/addressable supersession, and NIP-09 deletions. Which tags are indexed is configurable via the `indexTags` option, mirroring `NPostgres`.

## Usage

Construction is synchronous — pass the name of the IndexedDB database to use, and the store opens it (installing its schema) in the background. Every method awaits the connection before touching IndexedDB, so calls made before the open settles simply wait for it:

```ts
import { NIndexedDB } from '@nostrify/indexeddb';

const store = new NIndexedDB('my-events');

await store.event(event);
const events = await store.query([{ kinds: [1] }]);
```

When IndexedDB is unavailable (e.g. iOS Lockdown Mode, some private-browsing contexts), the store silently degrades to a no-op: `event()` does nothing and `query()` returns `[]`.

## License

MIT
