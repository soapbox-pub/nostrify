import type { NostrEvent, NostrSigner } from '@nostrify/types';

/**
 * NIP-07-compatible signer that proxies to browser extension, normalizing behavior across different implementations.
 *
 * This signer delegates all operations to the browser's `window.nostr` object,
 * which is typically provided by browser extensions like Alby, nos2x, etc.
 *
 * Usage:
 *
 * ```ts
 * const signer = new NBrowserSigner();
 * const pubkey = await signer.getPublicKey();
 * const event = await signer.signEvent({ kind: 1, content: 'Hello, world!', tags: [], created_at: 0 });
 * ```
 */
export class NBrowserSigner implements NostrSigner {
  private get nostr(): NostrSigner {
    const nostr = (globalThis as { nostr?: NostrSigner }).nostr;
    if (!nostr) {
      throw new Error('Browser extension not available');
    }
    return nostr;
  }

  async getPublicKey(): Promise<string> {
    const pubkey = await this.nostr.getPublicKey();
    if (typeof pubkey !== 'string') {
      throw new Error(`Nostr public key retrieval failed: expected string, got ${JSON.stringify(pubkey)}`);
    }
    return pubkey;
  }

  async signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
    const signed = await this.nostr.signEvent(event);
    if (typeof signed !== 'object' || !signed.id || !signed.pubkey || !signed.sig) {
      throw new Error(
        `Nostr event signing failed: expected object with id, pubkey, and sig, got ${JSON.stringify(signed)}`,
      );
    }
    return signed;
  }

  async getRelays(): Promise<Record<string, { read: boolean; write: boolean }>> {
    if (!this.nostr.getRelays) {
      return {};
    }
    const relays = await this.nostr.getRelays();
    if (typeof relays !== 'object' || relays === null) {
      throw new Error(`Nostr getRelays failed: expected object, got ${JSON.stringify(relays)}`);
    }
    return this.nostr.getRelays();
  }

  get nip04(): NostrSigner['nip04'] {
    const nostr = this.nostr;
    if (!nostr.nip04) {
      return undefined;
    }
    return {
      encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
        const encrypted = await nostr.nip04!.encrypt(pubkey, plaintext);
        if (typeof encrypted !== 'string') {
          throw new Error(`NIP-04 encryption failed: expected string result, got ${JSON.stringify(encrypted)}`);
        }
        return encrypted;
      },
      decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
        const decrypted = await nostr.nip04!.decrypt(pubkey, ciphertext);
        if (typeof decrypted !== 'string') {
          throw new Error(`NIP-04 decryption failed: expected string result, got ${JSON.stringify(decrypted)}`);
        }
        return decrypted;
      },
    };
  }

  get nip44(): NostrSigner['nip44'] {
    const nostr = this.nostr;
    if (!nostr.nip44) {
      return undefined;
    }
    return {
      encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
        const encrypted = await nostr.nip44!.encrypt(pubkey, plaintext);
        if (typeof encrypted !== 'string') {
          throw new Error(`NIP-44 encryption failed: expected string result, got ${JSON.stringify(encrypted)}`);
        }
        return encrypted;
      },
      decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
        const decrypted = await nostr.nip44!.decrypt(pubkey, ciphertext);
        if (typeof decrypted !== 'string') {
          throw new Error(`NIP-44 decryption failed: expected string result, got ${JSON.stringify(decrypted)}`);
        }
        return decrypted;
      },
    };
  }
}
