# Deno KV

[Deno KV](https://docs.deno.com/deploy/kv/manual/) is a flexible key-value store with multiple backends. On Deno Deploy, it is backed by FoundationDB. Locally it is backed by SQLite, and it can also connect to remote databases that follow the [KV Connect](https://github.com/denoland/denokv/blob/main/proto/kv-connect.md) protocol.

Nostrify offers support for Deno KV with the [`NDenoKv`](https://jsr.io/@nostrify/nostrify/doc/denokv/~/NDenoKv) class. You need the additional [`@nostrify/denokv`](https://jsr.io/@nostrify/denokv) package to use it.

> [!WARNING]
> This feature is in an alpha state and based on an unstable Deno API.

## Usage

NDenoKv implements [`NStore`](https://jsr.io/@nostrify/types/doc/~/NStore), allowing you to use it interchangeably with relays. Just initialize a Deno.Kv instance and pass it to NDenoKv.

```ts
import { NDenoKv } from '@nostrify/denokv';

const kv = await Deno.openKv();
const db = new NDenoKv(kv);
```

#### Insert an event

```ts
await db.event(event);
```

#### Query events

```ts
const events = await db.query([{ kinds: [1, 6], limit: 5 }]);
```

#### Count events

```ts
const { count } = await db.count([{ kinds: [1, 6] }]);
```

#### Remove events

```ts
await db.remove([{ kinds: [1, 6] }]);
```

## Keys

NDenoKv manages keys prefixed with `["nostr", ...]`

It is safe to use the Deno.Kv instance for other purposes as long as keys in the `nostr` namespace are not overwritten.
