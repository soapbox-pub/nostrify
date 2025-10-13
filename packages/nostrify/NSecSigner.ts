// deno-lint-ignore-file require-await

import { finalizeEvent, getPublicKey, nip04, nip44 } from 'nostr-tools';

import type { NostrEvent, NostrSigner } from '@nostrify/types';

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
  private pubkey?: string;

  constructor(secretKey: Uint8Array) {
    this.#secretKey = secretKey;
  }

  async getPublicKey(): Promise<string> {
    return this.pubkey ??= getPublicKey(this.#secretKey);
  }

  async signEvent(
    event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>,
  ): Promise<NostrEvent> {
    // @ts-ignore this is fine
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

  #getConversationKey(pubkey: string): Uint8Array {
    return nip44.v2.utils.getConversationKey(this.#secretKey, pubkey);
  }

  readonly nip44 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
      const conversationKey = this.#getConversationKey(pubkey);
      return nip44.v2.encrypt(plaintext, conversationKey);
    },

    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      const conversationKey = this.#getConversationKey(pubkey);
      return nip44.v2.decrypt(ciphertext, conversationKey);
    },
  };
}
