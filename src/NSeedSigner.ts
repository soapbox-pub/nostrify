import { HDKey } from 'npm:@scure/bip32@^1.3.3';

import { NSecSigner } from './NSecSigner.ts';

/**
 * Accepts an HD seed which it uses to derive the secret key according to [NIP-06](https://github.com/nostr-protocol/nips/blob/master/06.md).
 * This method is useful for supporting multiple accounts for the same user, or for sharing a Nostr account with a Bitcoin wallet.
 *
 * ```ts
 * const signer = new NSeedSigner(seed, 0);
 *
 * signer.getPublicKey();
 * signer.signEvent(t);
```
 */
export class NSeedSigner extends NSecSigner {
  constructor(seed: Uint8Array, account = 0) {
    const path = `m/44'/1237'/${account}'/0/0`;

    const { privateKey } = HDKey.fromMasterSeed(seed).derive(path);

    if (!privateKey) {
      throw new Error('Could not derive private key');
    }

    super(privateKey);
  }
}
