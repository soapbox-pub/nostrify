# Private Key Signer

The [`NSecSigner`](https://jsr.io/@nostrify/nostrify/doc/~/NSecSigner) class uses a private key to sign events.

## Usage

```ts
import { NSecSigner } from '@nostrify/nostrify';

const secretKey: Uint8Array = /* your secret key */;

const signer = new NSecSigner(secretKey);

const pubkey = await signer.getPublicKey();
const event = await signer.signEvent({ kind: 1, content: 'Hello, world!', tags: [], created_at: 0 });
```
