/** An object represeting any supported Nostr login credentials. */
export type NLogin = NLoginNsec | NLoginBunker | NLoginExtension;

/** Nostr login with nsec. */
export interface NLoginNsec extends NLoginBase {
  type: 'nsec';
  nsec: `nsec1${string}`;
}

/** NIP-46 (aka remote signer) login. */
export interface NLoginBunker extends NLoginBase {
  type: 'bunker';
  bunkerPubkey: string;
  clientNsec: `nsec1${string}`;
  relays: string[];
}

/** NIP-07 (browser extension) login. */
export interface NLoginExtension extends NLoginBase {
  type: 'extension';
}

/** Base properties shared by Nostr login objects. */
interface NLoginBase {
  id: `${string}:${string}`;
  type: string;
  pubkey: string;
  createdAt: string;
}
