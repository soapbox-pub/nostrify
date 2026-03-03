import type { NostrEvent, NostrSigner } from '@nostrify/types';

/**
 * NIP-07-compatible signer that proxies to browser extension, normalizing behavior across different implementations.
 *
 * This signer delegates all operations to the browser's `window.nostr` object,
 * which is typically provided by browser extensions like Alby, nos2x, etc.
 *
 * The signer will wait for the extension to become available, polling at short
 * intervals up to a configurable timeout. This handles the race condition where
 * app code runs before the extension's content script has injected `window.nostr`.
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
  #timeout: number;

  constructor(opts?: { timeout?: number }) {
    this.#timeout = opts?.timeout ?? 3000;
  }

  /** Wait for `globalThis.nostr` to become available, polling every 100ms up to the configured timeout. */
  private async awaitNostr(): Promise<NostrSigner> {
    const nostr = (globalThis as { nostr?: NostrSigner }).nostr;
    if (nostr) {
      return nostr;
    }

    const deadline = Date.now() + this.#timeout;

    return new Promise<NostrSigner>((resolve, reject) => {
      const interval = setInterval(() => {
        const nostr = (globalThis as { nostr?: NostrSigner }).nostr;
        if (nostr) {
          clearInterval(interval);
          resolve(nostr);
        } else if (Date.now() >= deadline) {
          clearInterval(interval);
          reject(new Error('Browser extension not available'));
        }
      }, 100);
    });
  }

  async getPublicKey(): Promise<string> {
    const nostr = await this.awaitNostr();
    const pubkey = await nostr.getPublicKey();
    if (typeof pubkey !== 'string') {
      throw new Error(`Nostr public key retrieval failed: expected string, got ${JSON.stringify(pubkey)}`);
    }
    return pubkey;
  }

  async signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
    const nostr = await this.awaitNostr();
    const signed = await nostr.signEvent(event);
    if (typeof signed !== 'object' || !signed.id || !signed.pubkey || !signed.sig) {
      throw new Error(
        `Nostr event signing failed: expected object with id, pubkey, and sig, got ${JSON.stringify(signed)}`,
      );
    }
    return signed;
  }

  async getRelays(): Promise<Record<string, { read: boolean; write: boolean }>> {
    const nostr = await this.awaitNostr();
    if (!nostr.getRelays) {
      return {};
    }
    const relays = await nostr.getRelays();
    if (typeof relays !== 'object' || relays === null) {
      throw new Error(`Nostr getRelays failed: expected object, got ${JSON.stringify(relays)}`);
    }
    return relays;
  }

  get nip04(): NostrSigner['nip04'] {
    const nostr = (globalThis as { nostr?: NostrSigner }).nostr;
    // Extension is loaded but doesn't support nip04
    if (nostr && !nostr.nip04) {
      return undefined;
    }
    // Extension not loaded yet, or extension supports nip04 — return wrapper
    return {
      encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
        const nostr = await this.awaitNostr();
        if (!nostr.nip04) {
          throw new Error('NIP-04 encryption not supported by extension');
        }
        const encrypted = await nostr.nip04.encrypt(pubkey, plaintext);
        if (typeof encrypted !== 'string') {
          throw new Error(`NIP-04 encryption failed: expected string result, got ${JSON.stringify(encrypted)}`);
        }
        return encrypted;
      },
      decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
        const nostr = await this.awaitNostr();
        if (!nostr.nip04) {
          throw new Error('NIP-04 decryption not supported by extension');
        }
        const decrypted = await nostr.nip04.decrypt(pubkey, ciphertext);
        if (typeof decrypted !== 'string') {
          throw new Error(`NIP-04 decryption failed: expected string result, got ${JSON.stringify(decrypted)}`);
        }
        return decrypted;
      },
    };
  }

  get nip44(): NostrSigner['nip44'] {
    const nostr = (globalThis as { nostr?: NostrSigner }).nostr;
    // Extension is loaded but doesn't support nip44
    if (nostr && !nostr.nip44) {
      return undefined;
    }
    // Extension not loaded yet, or extension supports nip44 — return wrapper
    return {
      encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
        const nostr = await this.awaitNostr();
        if (!nostr.nip44) {
          throw new Error('NIP-44 encryption not supported by extension');
        }
        const encrypted = await nostr.nip44.encrypt(pubkey, plaintext);
        if (typeof encrypted !== 'string') {
          throw new Error(`NIP-44 encryption failed: expected string result, got ${JSON.stringify(encrypted)}`);
        }
        return encrypted;
      },
      decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
        const nostr = await this.awaitNostr();
        if (!nostr.nip44) {
          throw new Error('NIP-44 decryption not supported by extension');
        }
        const decrypted = await nostr.nip44.decrypt(pubkey, ciphertext);
        if (typeof decrypted !== 'string') {
          throw new Error(`NIP-44 decryption failed: expected string result, got ${JSON.stringify(decrypted)}`);
        }
        return decrypted;
      },
    };
  }
}
