# Nostrify Types

TypeScript types for Nostr. This package includes Nostr standardized types from the NIPs, as well as useful interfaces that promote consistency across your applications.

The goal of this package is to create a TypeScript standard for Nostr, so that developers and library authors can create reusable components that can be easily swapped out. A lot of thought has been put into these types, so that they are simple, powerful, and feel natural to use.

It is a types-only package, so you can use it for free in any project.

```ts
import { NostrEvent, NostrFilter, NStore } from '@nostr/types';

export class MyStore implements NStore {
  async query(filters: NostrFilter[]): Promise<NostrEvent[]> {
    // Your implementation here
  }
}
```

## Naming Convention

- Types that start with `Nostr*` are standardized types from the NIPs.
- Types that start with `N*` are Nostrify types.

## Honorable Mentions

Here are a few examples of types provided by this package:

- `NostrEvent` - NIP-01 Nostr event. It is specifically not called `Event` to avoid conflicts with the built-in type.
- `NostrFilter` - NIP-01 Nostr filter.
- `NostrSigner` - NIP-07 signer interface. Nostrify contains a handful of implementations.
- `NStore` - Nostrify event storage. Can be a cache, a database, or any other storage. It returns events from Nostr filters and should implement NIP-01 functionality for replaceable events, NIP-09 deletions etc., so the event set is always valid.
- `NRelay` - Nostrify relay client. It extends NStore with a `.req` method for streaming. Single relay connections and relay pools both use this interface.
- `NPolicy` - Nostrify policy function for filtering out spam events and other unwanted content.
- `NUploader` - Nostrify file uploader. Accepts a `File` object and returns NIP-94 data. Has implementations for nostr.build and Blossom.

## License

MIT
