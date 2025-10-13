import { BunkerURI, NConnectSigner, NSecSigner } from '@nostrify/nostrify';
import type { NPool } from '@nostrify/nostrify';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import type { NostrSigner } from '@nostrify/types';

/** An object represeting any supported Nostr login credentials. */
export type NLoginType = NLoginNsec | NLoginBunker | NLoginExtension | NLoginOther;

/** Nostr login with nsec. */
export type NLoginNsec = NLoginBase<'nsec', {
  nsec: `nsec1${string}`;
}>;

/** NIP-46 (aka remote signer) login. */
export type NLoginBunker = NLoginBase<'bunker', {
  bunkerPubkey: string;
  clientNsec: `nsec1${string}`;
  relays: string[];
}>;

/** NIP-07 (browser extension) login. */
export type NLoginExtension = NLoginBase<'extension', null>;

/** Additional login types created by the library user. */
export type NLoginOther = NLoginBase<`x-${string}`, {
  [key: string]: unknown;
}>;

/** Base properties shared by Nostr login objects. */
interface NLoginBase<T extends string, D> {
  id: string;
  type: T;
  pubkey: string;
  createdAt: string;
  data: D;
}

/** Class representing Nostr login credentials. */
export class NLogin<T extends string, D> implements NLoginBase<T, D> {
  public id: string;
  public type: T;
  public pubkey: string;
  public createdAt: string;
  public data: D;

  constructor(type: T, pubkey: string, data: D) {
    this.id = `${type}:${pubkey}`;
    this.type = type;
    this.pubkey = pubkey;
    this.createdAt = new Date().toISOString();
    this.data = data;
  }

  /** Create a login object from an nsec. */
  static fromNsec(nsec: string): NLoginNsec {
    const decoded = nip19.decode(nsec);

    if (decoded.type !== 'nsec') {
      throw new Error('Invalid nsec');
    }

    const sk = decoded.data;
    const pubkey = getPublicKey(sk);

    return new NLogin('nsec', pubkey, {
      nsec: nip19.nsecEncode(sk),
    });
  }

  /** Create a login object from a bunker URI. */
  static async fromBunker(uri: string, pool: NPool): Promise<NLoginBunker> {
    const { pubkey: bunkerPubkey, secret, relays } = new BunkerURI(uri);

    if (!relays.length) {
      throw new Error('No relay provided');
    }

    const sk = generateSecretKey();
    const nsec = nip19.nsecEncode(sk);
    const clientSigner = new NSecSigner(sk);

    const signer = new NConnectSigner({
      relay: pool.group(relays),
      pubkey: bunkerPubkey,
      signer: clientSigner,
      timeout: 60_000,
    });

    await signer.connect(secret);
    const pubkey = await signer.getPublicKey();

    return new NLogin('bunker', pubkey, {
      bunkerPubkey,
      clientNsec: nsec,
      relays,
    });
  }

  /** Create a login object from a browser extension. */
  static async fromExtension(): Promise<NLoginExtension> {
    const windowSigner = (globalThis as unknown as { nostr?: NostrSigner }).nostr;

    if (!windowSigner) {
      throw new Error('Nostr extension is not available');
    }

    const pubkey = await windowSigner.getPublicKey();

    return new NLogin('extension', pubkey, null);
  }

  /** Convert to a JSON-serializable object. */
  toJSON(): NLoginBase<T, D> {
    return {
      id: this.id,
      type: this.type,
      pubkey: this.pubkey,
      createdAt: this.createdAt,
      data: this.data,
    };
  }
}
