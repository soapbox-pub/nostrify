import { verifyEvent as _verifyEvent } from 'nostr-tools';

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
  #verifyEvent: (event: NostrEvent) => boolean;

  constructor(opts?: {
    timeout?: number;
    /** Ensure an event returned by `signEvent` is valid. Default: `nostrTools.verifyEvent`. */
    verifyEvent?(event: NostrEvent): boolean;
  }) {
    this.#timeout = opts?.timeout ?? 3000;
    this.#verifyEvent = opts?.verifyEvent ?? _verifyEvent;
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
    // Rebuild from the NIP-01 fields alone. Besides normalizing what callers
    // get back, this drops anything else the extension hung off the object —
    // including nostr-tools' `verifiedSymbol`, which `verifyEvent` treats as a
    // cached result and returns without looking at the event. An in-process
    // signer (a polyfill, a test double, an extension shimmed into the page)
    // can carry that symbol through an object spread and would otherwise be
    // taken at its word.
    const normalized: NostrEvent = {
      id: signed.id,
      pubkey: signed.pubkey,
      kind: signed.kind,
      content: signed.content,
      tags: signed.tags,
      created_at: signed.created_at,
      sig: signed.sig,
    };

    // The three fields being present says only that the extension filled them
    // in. An extension that hands back a stale `id`, or a signature over
    // something other than what was asked for, produces an event that every
    // relay rejects — a long way from the bug.
    if (!this.#verifyEvent(normalized)) {
      throw new Error('Nostr event signing failed: the extension returned an invalid event');
    }
    return normalized;
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
