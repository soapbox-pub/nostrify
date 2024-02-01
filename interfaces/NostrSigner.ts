import { NostrEvent } from './NostrEvent.ts';

/** NIP-07 Nostr signer. */
export interface NostrSigner {
  /** Returns a public key as hex. */
  getPublicKey(): Promise<string>;
  /** Takes an event template, adds `id`, `pubkey` and `sig` and returns it. */
  signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent>;
  /** Returns a record of relay URLs to relay policies. */
  getRelays?(): Promise<Record<WebSocket['url'], { read: boolean; write: boolean }>>;
  /** @deprecated NIP-04 crypto methods. */
  nip04?: {
    /** @deprecated Returns ciphertext and iv as specified in NIP-04. */
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    /** @deprecated Takes ciphertext and iv as specified in NIP-04. */
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}
