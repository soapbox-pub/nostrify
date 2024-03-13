import { HDKey } from 'npm:@scure/bip32@^1.3.3';
import { mnemonicToSeedSync } from 'npm:@scure/bip39@^1.2.2';

import { NSecSigner } from './NSecSigner.ts';

export interface NPhraseSignerOpts {
  account?: number;
  passphrase?: string;
}

/**
 * Similar to `NSecSigner`, but it accepts a BIP-39 mnemonic seed phrase which it uses to derive the secret key according to [NIP-06](https://github.com/nostr-protocol/nips/blob/master/06.md).
 *
 * ```ts
 * const signer = new NPhraseSigner('abandon baby cabbage dad ...', {
 *   account: 0, // Optional account number. Default is 0.
 *   passphrase: 'very special mother', // Optional passphrase. Default is no passphrase.
 * });
 *
 * const pubkey = await signer.getPublicKey();
 * const event = await signer.signEvent({ content: 'Hello, world!', kind: 1, ... });
```
 */
export class NPhraseSigner extends NSecSigner {
  constructor(mnemonic: string, opts: NPhraseSignerOpts = {}) {
    const { account = 0, passphrase } = opts;

    const seed = mnemonicToSeedSync(mnemonic, passphrase);
    const path = `m/44'/1237'/${account}'/0/0`;

    const { privateKey } = HDKey.fromMasterSeed(seed).derive(path);
    if (!privateKey) {
      throw new Error('Could not derive private key');
    }

    super(privateKey);
  }
}
