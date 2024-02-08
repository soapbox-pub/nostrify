import { finalizeEvent, getPublicKey, nip04 } from 'npm:nostr-tools@^2.1.4';
import { HDKey } from 'npm:@scure/bip32@^1.3.3';
import { mnemonicToSeed } from 'npm:@scure/bip39@^1.2.2';

import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NostrSigner } from '../interfaces/NostrSigner.ts';

export interface MnemonicSignerOpts {
  account?: number;
  passphrase?: string;
}

/** [NIP-06](https://github.com/nostr-protocol/nips/blob/master/06.md) mnemonic signer. */
export class MnemonicSigner implements NostrSigner {
  #privateKey: Promise<Uint8Array>;

  constructor(mnemonic: string, opts: MnemonicSignerOpts = {}) {
    const { account = 0, passphrase } = opts;

    this.#privateKey = mnemonicToSeed(mnemonic, passphrase).then((seed) => {
      const path = `m/44'/1237'/${account}'/0/0`;

      const { privateKey } = HDKey.fromMasterSeed(seed).derive(path);

      if (!privateKey) {
        throw new Error('Could not derive private key');
      } else {
        return privateKey;
      }
    });
  }

  async getPublicKey(): Promise<string> {
    return getPublicKey(await this.#privateKey);
  }

  async signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
    return finalizeEvent(event, await this.#privateKey);
  }

  nip04 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
      return nip04.encrypt(await this.#privateKey, pubkey, plaintext);
    },

    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      return nip04.decrypt(await this.#privateKey, pubkey, ciphertext);
    },
  };
}
