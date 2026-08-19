import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english.js';

import { NSeedSigner } from './NSeedSigner.ts';

export interface NPhraseSignerOpts {
  account?: number;
  passphrase?: string;
  /**
   * BIP-39 wordlist the mnemonic is written in, used to check it.
   * Default: English. Other wordlists ship with `@scure/bip39`.
   */
  wordlist?: string[];
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
export class NPhraseSigner extends NSeedSigner {
  constructor(mnemonic: string, opts: NPhraseSignerOpts = {}) {
    const { account, passphrase, wordlist = english } = opts;

    // A mnemonic carries a checksum precisely so a mistyped one can be caught.
    // Without this, any string at all is a valid input: it hashes to *a* seed,
    // which derives *a* key, and the user gets an account that isn't theirs —
    // silently, and identically every time, so it looks like it worked.
    if (!validateMnemonic(mnemonic, wordlist)) {
      throw new Error('Invalid mnemonic');
    }

    const seed = mnemonicToSeedSync(mnemonic, passphrase);

    super(seed, account);
  }
}
