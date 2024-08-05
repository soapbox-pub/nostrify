# Nostrify Deno KV

This package provides a Nostr event storage built on [Deno KV](https://docs.deno.com/deploy/kv/manual/).

## Usage

```ts
import { NDenoKv } from '@nostrify/denokv';

const kv = await Deno.openKv();
const db = new NDenoKv(kv);
```

For the full docs, see: https://nostrify.dev/store/denokv

## License

MIT
