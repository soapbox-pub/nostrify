# Nostrify with NDK

Nostrify provides an adapter for [NDK](https://github.com/nostr-dev-kit/ndk) with `@nostrify/ndk`. This enables you to use NDK as a storage backend for Nostrify.

## Installation

::: code-group

```sh [npm]
npm install @nostrify/ndk
```

```sh [yarn]
yarn add @nostrify/ndk
```

```sh [pnpm]
pnpm add @nostrify/ndk
```

```sh [Bun]
bun add @nostrify/ndk
```

:::

## Usage

Set up NDK as normal, and then pass your NDK instance into `NDKStore` to make it available as a [Nostrify relay](/relay/).

```ts
import NDK from '@nostr-dev-kit/ndk';
import { NDKStore } from '@nostrify/ndk';

const ndk = new NDK(/* set up NDK */);
await ndk.connect();

const relay = new NDKStore(ndk); // Now it works like a Nostrify relay!
```
