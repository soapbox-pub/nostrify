import { HDKey } from 'npm:@scure/bip32@^1.3.3';

import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NostrSigner } from '../interfaces/NostrSigner.ts';

import { NSecSigner } from './NSecSigner.ts';

/** `NHDSigner` options. */
export interface NDSignerOpts {
  /** User ID of the user to sign for. */
  user: string;
  /** Shared secret for the signer. */
  seed: Uint8Array;
  /** Account to use for this user (default: `0`). */
  account?: number;
}

/**
 * Deterministic signer class.
 * Takes a unique user ID (typically from your database) and generates a unique key from it.
 * You must also provide a seed.
 *
 * ```ts
 * const signer = new NDSigner({
 *   seed: new TextEncoder().encode('41m/FT2MOYBAJfIphFOTRTu2prGz/m9cdxS0lcYfetbszzy1BbVxAIQpV6vkTv2U'), // generate with `openssl rand -base64 48`
 *   user: '1234', // Unique user ID
 * });
 *
 * signer.getPublicKey();
 * signer.signEvent(t);
 * ```
 */
export class NDSigner implements NostrSigner {
  private signer: Promise<NSecSigner>;
  private user: string;
  #seed: Uint8Array;

  constructor({ user, seed, account = 0 }: NDSignerOpts) {
    this.user = user;
    this.#seed = seed;

    this.signer = new Promise<NSecSigner>((resolve, reject) => {
      crypto.subtle.importKey(
        'raw',
        this.#seed,
        { name: 'HMAC', hash: { name: 'SHA-256' } },
        false,
        ['sign'],
      )
        .then((cryptoKey) => {
          const data = new TextEncoder().encode(this.user);
          return crypto.subtle.sign('HMAC', cryptoKey, data);
        })
        .then((signature) => {
          const seed = new Uint8Array(signature);
          const path = `m/44'/1237'/${account}'/0/0`;
          const { privateKey } = HDKey.fromMasterSeed(seed).derive(path);
          if (!privateKey) {
            throw new Error('Failed to derive private key');
          }
          resolve(new NSecSigner(privateKey));
        })
        .catch(reject);
    });
  }

  async getPublicKey(): Promise<string> {
    const signer = await this.signer;
    return signer.getPublicKey();
  }

  async signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
    const signer = await this.signer;
    return signer.signEvent(event);
  }

  readonly nip04 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
      const signer = await this.signer;
      return signer.nip04.encrypt(pubkey, plaintext);
    },

    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      const signer = await this.signer;
      return signer.nip04.decrypt(pubkey, ciphertext);
    },
  };

  readonly nip44 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
      const signer = await this.signer;
      return signer.nip44.encrypt(pubkey, plaintext);
    },

    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      const signer = await this.signer;
      return signer.nip44.decrypt(pubkey, ciphertext);
    },
  };
}
