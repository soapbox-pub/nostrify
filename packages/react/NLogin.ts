export type NLogin = NLoginNsec | NLoginBunker | NLoginExtension;

export interface NLoginNsec extends NLoginBase {
  type: 'nsec';
  nsec: `nsec1${string}`;
}

export interface NLoginBunker extends NLoginBase {
  type: 'bunker';
  bunkerPubkey: string;
  clientNsec: `nsec1${string}`;
  relays: string[];
}

export interface NLoginExtension extends NLoginBase {
  type: 'extension';
}

interface NLoginBase {
  type: string;
  pubkey: string;
  createdAt: string;
}
