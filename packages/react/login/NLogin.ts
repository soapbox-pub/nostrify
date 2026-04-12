import { BunkerURI, NConnectSigner, NSecSigner } from '@nostrify/nostrify';
import type { NPool } from '@nostrify/nostrify';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import type { NostrSigner } from '@nostrify/types';

/** Parameters for initiating a nostrconnect:// session. */
export interface NostrConnectParams {
  /** The ephemeral client secret key. */
  clientSecretKey: Uint8Array;
  /** The ephemeral client public key (derived from clientSecretKey). */
  clientPubkey: string;
  /** A random secret for validating the signer's response. */
  secret: string;
  /** Relay URLs for NIP-46 communication. */
  relays: string[];
}

/** Options for generating a nostrconnect:// URI. */
export interface NostrConnectURIOptions {
  /** Application name to include in the URI. */
  name?: string;
  /** Callback URL for mobile signer apps to redirect back to. */
  callback?: string;
}

/** Generate random parameters for a nostrconnect:// session. */
export function generateNostrConnectParams(relays: string[]): NostrConnectParams {
  const clientSecretKey = generateSecretKey();
  const clientPubkey = getPublicKey(clientSecretKey);
  const secret = crypto.randomUUID();

  return {
    clientSecretKey,
    clientPubkey,
    secret,
    relays,
  };
}

/** Generate a nostrconnect:// URI from the given parameters. */
export function generateNostrConnectURI(params: NostrConnectParams, opts?: NostrConnectURIOptions): string {
  const searchParams = new URLSearchParams();

  for (const relay of params.relays) {
    searchParams.append('relay', relay);
  }
  searchParams.set('secret', params.secret);

  if (opts?.name) {
    searchParams.set('name', opts.name);
  }
  if (opts?.callback) {
    searchParams.set('callback', opts.callback);
  }

  return `nostrconnect://${params.clientPubkey}?${searchParams.toString()}`;
}

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

  /**
   * Create a login object via client-initiated NIP-46 (nostrconnect://).
   *
   * The client displays a QR code or deep link containing the `nostrconnect://` URI,
   * then waits for the remote signer to respond over the relay. Once the signer responds,
   * the connection is validated and an `NLoginBunker` is returned.
   */
  static async fromNostrConnect(params: NostrConnectParams, pool: NPool, opts?: { signal?: AbortSignal }): Promise<NLoginBunker> {
    const clientSigner = new NSecSigner(params.clientSecretKey);
    const relayGroup = pool.group(params.relays);

    const signal = opts?.signal ?? AbortSignal.timeout(120_000);

    const sub = relayGroup.req(
      [{ kinds: [24133], '#p': [params.clientPubkey] }],
      { signal },
    );

    for await (const msg of sub) {
      if (msg[0] === 'CLOSED') {
        throw new Error('Connection closed before remote signer responded');
      }
      if (msg[0] === 'EVENT') {
        const event = msg[2];

        const decrypted = await clientSigner.nip44!.decrypt(event.pubkey, event.content);
        const response = JSON.parse(decrypted);

        if (response.result !== params.secret && response.result !== 'ack') {
          continue;
        }

        const bunkerPubkey = event.pubkey;

        const signer = new NConnectSigner({
          relay: relayGroup,
          pubkey: bunkerPubkey,
          signer: clientSigner,
          timeout: 60_000,
        });

        const userPubkey = await signer.getPublicKey();

        return new NLogin('bunker', userPubkey, {
          bunkerPubkey,
          clientNsec: nip19.nsecEncode(params.clientSecretKey),
          relays: params.relays,
        });
      }
    }

    throw new Error('Timeout waiting for remote signer');
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
