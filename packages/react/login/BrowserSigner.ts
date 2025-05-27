// deno-lint-ignore-file require-await
import type { NostrEvent, NostrSigner } from '@nostrify/types';

/**
 * NIP-07-compatible signer that proxies to browser extension.
 *
 * This signer delegates all operations to the browser's `window.nostr` object,
 * which is typically provided by browser extensions like Alby, nos2x, etc.
 *
 * Usage:
 *
 * ```ts
 * const signer = new BrowserSigner();
 * const pubkey = await signer.getPublicKey();
 * const event = await signer.signEvent({ kind: 1, content: 'Hello, world!', tags: [], created_at: 0 });
 * ```
 */
export class BrowserSigner implements NostrSigner {
  private get nostr(): NostrSigner {
    const nostr = (globalThis as { nostr?: NostrSigner }).nostr;
    if (!nostr) {
      throw new Error('Browser extension not available');
    }
    return nostr;
  }

  async getPublicKey(): Promise<string> {
    return this.nostr.getPublicKey();
  }

  async signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
    return this.nostr.signEvent(event);
  }

  async getRelays(): Promise<Record<string, { read: boolean; write: boolean }>> {
    if (!this.nostr.getRelays) {
      return {};
    }
    return this.nostr.getRelays();
  }

  get nip04() {
    const nostr = this.nostr;
    if (!nostr.nip04) {
      return undefined;
    }
    return {
      encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
        return nostr.nip04!.encrypt(pubkey, plaintext);
      },
      decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
        return nostr.nip04!.decrypt(pubkey, ciphertext);
      },
    };
  }

  get nip44() {
    const nostr = this.nostr;
    if (!nostr.nip44) {
      return undefined;
    }
    return {
      encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
        return nostr.nip44!.encrypt(pubkey, plaintext);
      },
      decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
        return nostr.nip44!.decrypt(pubkey, ciphertext);
      },
    };
  }
}
