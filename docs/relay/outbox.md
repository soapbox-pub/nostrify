---
outline: deep
---

# The Outbox Model

Nostr is comprised of thousands of relays. Trying to scour every one of them is inefficient and unproductive.
That's why Mike Dilger proposed the ["Gossip Model"](https://mikedilger.com/gossip-model/) (later renamed the "Outbox Model").

To implement outbox support, your app must maintain a routing table associating people with relays.
Then, when you want to query events from a particular author, you can select the best relay(s) to use.
This is a big improvement over querying random relays or trying to query the whole network.

Nostrify's [pool](/relay/pool) is designed with outbox support in mind. But it doesn't ship with any magic sauce; it expects you to implement it yourself. Here's how.

## Tutorial

This example will teach you how to track outbox events, and then query them from `NPool`.

### Create a Database

First, we'll create an SQLite database to track [NIP-65](https://github.com/nostr-protocol/nips/blob/master/65.md) events.

::: code-group

```ts [outbox.ts]
import { Database } from '@db/sqlite';
import { DenoSqlite3Dialect } from '@soapbox/kysely-deno-sqlite';
import { Kysely } from 'kysely';

export const outbox = new NDatabase(
  new Kysely({
    dialect: new DenoSqlite3Dialect({
      database: new Database('./outbox.sqlite3'),
    }),
  }),
);

await outbox.migrate();
```

:::

> [!TIP]
> Any type of [storage](/store/) will do.
> For more on SQLite, see [SQL Databases](/store/sql).

### Collect Outbox Events

Your application will need some way to collect outbox events. There are various ways to do it, and it's up to your application.

One strategy is to process `nprofile` identifiers when they're pasted into your application. Here's an example.

::: code-group

```ts [profile.ts]
import { NRelay1 } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { outbox } from './outbox.ts';

export async function handleProfile(nprofile: string, signal?: AbortSignal) {
  const result = nip19.decode(nprofile);

  if (result.type === 'nprofile') {
    const { pubkey, relays = [] } = result.data;

    if (relays[0]) {
      const relay = new NRelay1(relays[0]);

      const [event] = await relay.query(
        [{ kinds: [10002], authors: [pubkey], limit: 1 }],
        { signal },
      );

      // Store the outbox event.
      if (event) {
        await outbox.event(event);
      }

      await relay.close();
    }
  }
}
```

:::

### Create a Pool

Let's create a [pool](/relay/pool) that uses our outbox database to decide which relays to use.

First we'll hardcode the relays, then we'll improve it below.

::: code-group

```ts [pool.ts]
import { NPool, NRelay1 } from '@nostrify/nostrify';

export const pool = new NPool({
  // Called when a new relay needs to be added to the pool.
  open(url) {
    return new NRelay1(url);
  },

  // Given a set of filters, return the relays to use for making requests.
  async reqRouter(filters) {
    return new Map([
      ['wss://relay1.mostr.pub', filters],
      ['wss://relay2.mostr.pub', filters],
    ]);
  },

  // Given an event, return the relays to use for publishing it.
  async eventRouter(event) {
    return ['wss://relay1.mostr.pub', 'wss://relay2.mostr.pub'];
  },
});
```

:::

#### Routing Requests

Now let's implement outbox for requests:

::: code-group

```ts{3,10-48} [pool.ts]
import { NostrFilter, NPool, NRelay1 } from '@nostrify/nostrify';

import { outbox } from './outbox.ts';

export const pool = new NPool({
  open(url) {
    return new NRelay1(url);
  },

  // Get the relays to use for making requests.
  async reqRouter(filters) {
    const authors = new Set<string>();
    const routes = new Map<string, NostrFilter[]>();

    // Gather the authors from the filters.
    for (const filter of filters) {
      for (const author of filter.authors ?? []) {
        authors.add(author);
      }
    }

    // Query for outbox events.
    const events = await outbox.query([
      { kinds: [10002], authors: [...authors], limit: authors.size },
    ]);

    // Gather relays from NIP-65 events.
    for (const event of events) {
      for (const [name, value] of event.tags) {
        if (name === 'r') {
          try {
            const url = new URL(value).toString(); // Normalize the URL.
            routes.add(url, filters);
          } catch (_e) {
            // skip
          }
        }
      }
    }

    // Finally, return the relays.
    if (routes.size) {
      return routes;
    } else {
      // Optional: fall back to hardcoded relays.
      return new Map(
        ['wss://relay1.mostr.pub', filters],
        ['wss://relay2.mostr.pub', filters],
      );
    }
  },

  // Get the relays to use for publishing events.
  async eventRouter(event) {
    return ['wss://relay1.mostr.pub', 'wss://relay2.mostr.pub'];
  },
});
```

:::

> [!TIP]
>
> - This should be broken up into smaller functions.
> - There are many ways to do this - this is just a starting point!
> - You can also route based on kinds, tags, or anything else in filters.
> - You may want to limit the number of relays returned for performance reasons.
> - If different filters should go to different relays, break up the filters in your router.

#### Publishing Events

Next we'll publish events with the user's own relay list. This is similar to the above, but a bit simpler.

::: code-group

```ts{15-41} [pool.ts]
import { NPool, NRelay1 } from '@nostrify/nostrify';

import { outbox } from './outbox.ts';

export const pool = new NPool({
  open(url) {
    return new NRelay1(url);
  },

  // Get the relays to use for making requests.
  async reqRouter(filters) {
    /* Same as above. */
  },

  // Get the relays to use for publishing events.
  async eventRouter(event) {
    const relays = new Set<string>();

    // Get just the current user's relay list.
    const [relayList] = await outbox.query([
      { kinds: [10002], authors: [event.pubkey], limit: 1 },
    ]);

    // Gather relays from NIP-65 events.
    for (const [name, value] of relayList?.tags ?? []) {
      if (name === 'r') {
        try {
          const url = new URL(value).toString(); // Normalize the URL.
          relays.add(url);
        } catch (_e) {
          // skip
        }
      }
    }

    if (relays.size) {
      return [...relays];
    } else {
      return ['wss://relay1.mostr.pub', 'wss://relay2.mostr.pub'];
    }
  },
});
```

:::

> [!TIP]
>
> - This implementation publishes only to the current user's relays.
> - A proposed ["Inbox Model"](https://github.com/nostr-protocol/nips/discussions/1134) suggests delivering events to the outbox of each of the author's followers. That would be a little more complex.

#### Using the Pool

That's it! Now the pool can be used just like any other relay.

```ts
for await (const msg of pool.req(filters)) {
  console.log(msg);
}
```

See [Relay Pool](/relay/pool) for more information.

## Final Thoughts

The Outbox Model is still evolving, and there is no one-size-fits-all solution. But with a little creativity, you can build a system that works for your application.

[NPool](/relay/pool) is designed to be a flexible router for implementing Outbox, Inbox, or whatever else you can dream up. It's up to you to decide how to use it.

New modules will be created in the future to reduce boilerplate. This API will enable people to have breakthroughs in how they use Nostr.
