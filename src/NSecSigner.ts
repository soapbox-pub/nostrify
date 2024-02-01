// deno-lint-ignore-file require-await

import { finalizeEvent, getPublicKey, nip04 } from 'npm:nostr-tools@^2.1.4';

import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NostrSigner } from '../interfaces/NostrSigner.ts';

/**
 * NIP-07-compatible signer with secret key. It is a drop-in replacement for `window.nostr`.
 *
 * Usage:
 *
 * ```ts
 * const signer = new NSecSigner(secretKey);
 * const pubkey = await signer.getPublicKey();
 * const event = await signer.signEvent({ kind: 1, content: 'Hello, world!', tags: [], created_at: 0 });
 * ```
 */
export class NSecSigner implements NostrSigner {
  #secretKey: Uint8Array;

  constructor(secretKey: Uint8Array) {
    this.#secretKey = secretKey;
  }

  async getPublicKey(): Promise<string> {
    return getPublicKey(this.#secretKey);
  }

  async signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
    return finalizeEvent(event, this.#secretKey);
  }

  readonly nip04 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
      return nip04.encrypt(this.#secretKey, pubkey, plaintext);
    },

    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      return nip04.decrypt(this.#secretKey, pubkey, ciphertext);
    },
  };
}
