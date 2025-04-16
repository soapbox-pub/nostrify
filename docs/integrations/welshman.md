# Nostrify with Welshman

[Welshman](https://github.com/coracle-social/welshman) is a Nostr library by [Coracle](https://coracle.social/).

It uses a powerful relay selection algorithm to choose the best relays for each request, enabling outbox support and more.

> [!WARNING]
> Welshman is still in development and may not be stable.

## Installation

You will need the [`@nostrify/welshman`](https://jsr.io/@nostrify/welshman) package.

::: code-group

```sh [npm]
npx jsr add @nostrify/welshman
```

```sh [Deno]
deno add @nostrify/welshman
```

```sh [yarn]
yarn dlx jsr add @nostrify/welshman
```

```sh [pnpm]
pnpm dlx jsr add @nostrify/welshman
```

```sh [Bun]
bunx jsr add @nostrify/welshman
```

:::

## Usage

The [`NWelshman`](https://jsr.io/@nostrify/welshman/doc/~/NWelshman) class is a relay pool that accepts a Welshman Router object.

```ts
import { NWelshman } from '@nostrify/welshman';

const pool = new NWelshman(router);
```

### Router

The Router class comes from Welshman itself. Here is a template to get you started:

```ts
import { RelayMode, Router } from '@welshman/util';

const router = new Router({
  getUserPubkey: (): string | null => null,
  getGroupRelays: (address: string): string[] => [],
  getCommunityRelays: (address: string): string[] => [],
  getPubkeyRelays: (pubkey: string, mode?: RelayMode): string[] => [],
  getStaticRelays: (): string[] => [],
  getIndexerRelays: (): string[] => [],
  getSearchRelays: (): string[] => [],
  getRelayQuality: (url: string): number => 1,
  getRedundancy: (): number => 2,
  getLimit: (): number => 10,
});
```

See a detailed explanation of each option [here](https://github.com/coracle-social/welshman/blob/8b8775d2a0cd0b6bc60958fa33423ebd37151595/packages/util/Router.ts#L13).
