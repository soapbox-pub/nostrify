import { NSeedSigner } from "./NSeedSigner.ts";

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
 * const alex = await signers.get('alex');
 * const fiatjaf = await signers.get('fiatjaf');
 *
 * alex.getPublicKey();
 * fiatjaf.signEvent(t);
 * ```
 */
export class NCustodial {
  #seed: Uint8Array;

  constructor(seed: Uint8Array) {
    this.#seed = seed;
  }

  /** Get a signer for the given user. */
  async get(user: string, account = 0): Promise<NSeedSigner> {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      this.#seed as BufferSource,
      { name: "HMAC", hash: { name: "SHA-256" } },
      false,
      ["sign"],
    );

    const data = new TextEncoder().encode(user);
    const hash = await crypto.subtle.sign("HMAC", cryptoKey, data);
    const seed = new Uint8Array(hash);

    return new NSeedSigner(seed, account);
  }
}
