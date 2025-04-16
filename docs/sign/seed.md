# Seed Signer

[`NSeedSigner`](https://jsr.io/@nostrify/nostrify/doc/~/NSeedSigner) derives a Nostr identity from a binary [Hierarchical Deterministic (HD)](https://bips.xyz/32) seed.

The seed is used to derive the secret key according to [NIP-06](https://github.com/nostr-protocol/nips/blob/master/06.md).
This method is useful for supporting multiple accounts for the same user, or for sharing a Nostr account with a Bitcoin wallet.

## Usage

```ts
import { NSeedSigner } from '@nostrify/nostrify';

const seed: Uint8Array = /* your seed */;

const signer = new NSeedSigner(seed, 0);

signer.getPublicKey();
signer.signEvent(t);
```

## Multiple Accounts

To derive a different account from the same seed, just use a different `account` value.

```ts
const signer = new NSeedSigner(seed, 1);
```

## Mnemonic Phrase Signer

[`NPhraseSigner`](https://jsr.io/@nostrify/nostrify/doc/~/NPhraseSigner) accepts a [mnemonic seed phrase](https://bips.xyz/39), which it uses as the seed.

Internally, this signer uses NSeedSigner.
It is essentially the same thing, it just converts the mnemonic phrase into a seed before passing it to the HD Seed signer.

### Usage

```ts
import { NPhraseSigner } from '@nostrify/nostrify';

const signer = new NPhraseSigner('abandon baby cabbage dad ...', {
  account: 0, // Optional account number. Default is 0.
  passphrase: 'very special mother', // Optional passphrase. Default is no passphrase.
});

const pubkey = await signer.getPublicKey();
const event = await signer.signEvent({ content: 'Hello, world!', kind: 1, ... });
```