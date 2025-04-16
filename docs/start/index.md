# Getting Started

Nostrify is a flexible library for building Nostr apps in TypeScript.
It provides [Relays](/relay/), [Signers](/sign/), [Storages](/store/), and more to help you build your app.

Classes in Nostrify conform to a set of standard [interfaces](https://jsr.io/@nostrify/nostrify/doc), so if one implementation doesn't work for you, you can switch it out, or build your own!

## Installation

Nostrify is available on [jsr](https://jsr.io/@nostrify/nostrify), a modern alternative to npm.

::: code-group

```sh [npm]
npx jsr add @nostrify/nostrify
```

```sh [Deno]
deno add @nostrify/nostrify
```

```sh [yarn]
yarn dlx jsr add @nostrify/nostrify
```

```sh [pnpm]
pnpm dlx jsr add @nostrify/nostrify
```

```sh [Bun]
bunx jsr add @nostrify/nostrify
```

:::

## Usage

```ts
import { Nostrify } from '@nostrify/nostrify';
```

## What Next?

You may want to connect to [relay](/relay/), add a [storage](/store/) or [sign events](/sign/)!

Want to use Nostrify with other libraries? Check [integrations](/integrations/).
