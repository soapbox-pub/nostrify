---
outline: deep
---

# Nostr Schema

When we gather Nostr events, lookup profiles, and get messages from relays, it's essential that the data is in the right shape. But it's a decentralized network — how do we enforce that?

Enter [zod](https://github.com/colinhacks/zod), a schema parsing library. zod lets us define schemas that force the data into the right shape, or outright reject it if it's too far off.

This ensures that runtime data actually matches our types (unlike haphazard type assertions like `as NostrEvent`).
Without this, our application would be prone to errors and potentially even security risks.

Nostrify offers a robust schema module for Nostr, parsing everything from events, to IDs, to relay messages with zod.

## Usage

We import with the alias `n` for convenience, similar to zod's `z`.

```ts
import { NSchema as n } from '@nostrify/nostrify';
```

### Parse vs Safe Parse

All schemas have a `.parse` method that throws an error if the data is invalid. If you prefer to handle errors yourself, you can use `.safeParse` instead. See [zod basic usage](https://github.com/colinhacks/zod#basic-usage).

## Parse a Nostr Event

Ensure the event is in the right shape (but does not verify it).

```ts
const event = n.event().parse(data);
```

## Parse and Verify a Nostr Event

Parse and verify the event in one go (thanks to nostr-tools and zod [`.refine`](https://github.com/colinhacks/zod#refine)).

```ts
import { verifyEvent } from 'nostr-tools';

const event = n.event().refine(verifyEvent).parse(data);
```

## Parse a Nostr Filter

Parse a NIP-01 filter.

```ts
const filter = n.filter().parse(data);
```

Parse an array of filters.

```ts
const filters = n.filter().array().parse(data);
```

## Kind 0 Metadata

Profile metadata is usually stringified JSON. You can parse it in a single step.

```ts
const metadata = n.json().pipe(n.metadata()).parse(event.content);
```

If you already have it as JSON, you can of course parse that too.

```ts
const metadata = n.metadata().parse(json);
```

> [!TIP]
> You can use `n.json().pipe()` any time you need to parse JSON before another schema, thanks to zod [`.pipe`](https://github.com/colinhacks/zod#pipe).

## Relay Messages

Parse messages from a relay.

Returns a union type like `["EVENT", ...] | ["EOSE", ...] | ["OK", ...] | etc`

```ts
const msg = n.relayMsg().parse(data);
```

### Specific Message Types

You can also parse specific message types.

```ts
const eventMsg = n.relayEVENT().parse(data);
const okMsg = n.relayOK().parse(data);
const eoseMsg = n.relayEOSE().parse(data);
const noticeMsg = n.relayNOTICE().parse(data);
const closedMsg = n.relayCLOSED().parse(data);
const authMsg = n.relayAUTH().parse(data);
const countMsg = n.relayCOUNT().parse(data);
```

## Client Messages

Parse messages from a client.

Returns a union type like `["EVENT", ...] | ["REQ", ...] | ["COUNT", ...] | etc`

```ts
const msg = n.clientMsg().parse(data);
```

### Specific Message Types

You can also parse specific message types.

```ts
const eventMsg = n.clientEVENT().parse(data);
const reqMsg = n.clientREQ().parse(data);
const countMsg = n.clientCOUNT().parse(data);
const closeMsg = n.clientCLOSE().parse(data);
const authMsg = n.clientAUTH().parse(data);
```

## Hex IDs

Event IDs and pubkeys can be parsed with the `n.id()` schema.

```ts
const id = n.id().parse('58069df16f472997ef6dcb98fd7df1f8b7efefce183c87dccd302f5ee52fe897');
const pubkey = n.id().parse('38f26c42aaa77430d9ea75accd1eb9b89f305940ec36ce8ad71c1662a952a0ea');
```

## Bech32 IDs

Bech32 IDs such as `npub`, `nsec`, `nprofile`, etc. can be parsed with the `n.bech32()` schema.
You can specify the prefix as an argument.
Note that this is a regex match and does not attempt to actually parse the data.

```ts
const npub = n.bech32('npub').parse('npub1gccadx8a5gq623sk55kyua9kj7ppmfw3hhm6us7ltjxhhzrkpwpsu5p70s');
```
