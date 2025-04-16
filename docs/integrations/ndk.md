# Nostrify with NDK

Nostrify provides an adapter for [NDK](https://github.com/nostr-dev-kit/ndk) with [`@nostrify/ndk`](https://jsr.io/@nostrify/ndk). This enables you to use NDK as a storage backend for Nostrify.

## Installation

::: code-group
```sh [npm]
npx jsr add @nostrify/ndk
```
```sh [Deno]
deno add @nostrify/ndk
```
```sh [yarn]
yarn dlx jsr add @nostrify/ndk
```
```sh [pnpm]
pnpm dlx jsr add @nostrify/ndk
```
```sh [Bun]
bunx jsr add @nostrify/ndk
```
:::

## Usage

Set up NDK as normal, and then pass your NDK instance into [`NDKStore`](https://jsr.io/@nostrify/ndk/doc/~/NDKStore) to make it available as a [Nostrify relay](/relay/).

```ts
import NDK from '@nostr-dev-kit/ndk';
import { NDKStore } from '@nostrify/ndk';

const ndk = new NDK(/* set up NDK */);
await ndk.connect();

const relay = new NDKStore(ndk); // Now it works like a Nostrify relay!
```