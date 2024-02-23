import { HDKey } from 'npm:@scure/bip32@^1.3.3';
import { mnemonicToSeedSync } from 'npm:@scure/bip39@^1.2.2';

import { NSecSigner } from './NSecSigner.ts';

export interface NSeedSignerOpts {
  account?: number;
  passphrase?: string;
}

/** [NIP-06](https://github.com/nostr-protocol/nips/blob/master/06.md) mnemonic seed signer. */
export class NSeedSigner extends NSecSigner {
  constructor(mnemonic: string, opts: NSeedSignerOpts = {}) {
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
