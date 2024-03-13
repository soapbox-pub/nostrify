import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NostrSigner } from '../interfaces/NostrSigner.ts';

import { NSeedSigner } from './NSeedSigner.ts';

/** `NCustodial` options. */
export interface NCustodialOpts {
  /** User ID of the user to sign for. */
  user: string;
  /** Account to use for this user (default: `0`). */
  account?: number;
}

/**
 * Signer manager for multiple users.
 * Pass a shared secret into it, then it will generate keys for your users determinstically.
 * Useful for custodial auth where you only want to manage one secret for the entire application.
 *
 * ```ts
 * const SECRET_KEY = Deno.env.get('SECRET_KEY'); // generate with `openssl rand -base64 48`
 * const seed = new TextEncoder().encode(SECRET_KEY);
 *
 * const signers = new NCustodial(seed);
 *
 * signers.get('alex').getPublicKey();
 * signers.get('fiatjaf').signEvent(t);
 * ```
 */
export class NCustodial {
  #seed: Uint8Array;

  constructor(seed: Uint8Array) {
    this.#seed = seed;
  }

  /** Get a signer for the given user. */
  get(user: string, account = 0): NostrSigner {
    return new NAsyncSigner(async () => {
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        this.#seed,
        { name: 'HMAC', hash: { name: 'SHA-256' } },
        false,
        ['sign'],
      );

      const data = new TextEncoder().encode(user);
      const hash = await crypto.subtle.sign('HMAC', cryptoKey, data);
      const seed = new Uint8Array(hash);

      return new NSeedSigner(seed, account);
    });
  }
}

/** This is all just so we can call `await NCustodial.get('alex').getPublicKey()` instead of `await (await NCustodial.get('alex')).getPublicKey()`. */
class NAsyncSigner implements NostrSigner {
  private signer: Promise<NostrSigner>;

  constructor(getSigner: () => Promise<NostrSigner>) {
    this.signer = getSigner();
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
      return signer.nip04!.encrypt(pubkey, plaintext);
    },

    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      const signer = await this.signer;
      return signer.nip04!.decrypt(pubkey, ciphertext);
    },
  };

  readonly nip44 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
      const signer = await this.signer;
      return signer.nip44!.encrypt(pubkey, plaintext);
    },

    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      const signer = await this.signer;
      return signer.nip44!.decrypt(pubkey, ciphertext);
    },
  };
}
