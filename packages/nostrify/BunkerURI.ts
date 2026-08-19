/** Construct a [NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md) bunker URI. */
export class BunkerURI {
  /** Remote signer pubkey. */
  pubkey: string;
  /** Relay URLs on which the client is listening for responses from the remote-signer. */
  relays: string[];
  /** A short random string that the remote-signer should return as the `result` field of its response. */
  secret?: string;

  constructor(uri: string) {
    const url = new URL(uri);
    const params = new URLSearchParams(url.search);

    // https://github.com/denoland/deno/issues/26440
    const pubkey = (url.hostname || url.pathname.slice(2)).toLowerCase();
    const relays = params.getAll('relay');
    const secret = params.get('secret') ?? undefined;

    if (url.protocol !== 'bunker:') {
      throw new Error('Invalid bunker URI: expected a bunker:// URI');
    }

    // This pubkey becomes the counterparty of every NIP-46 exchange on the
    // connection — the key requests are encrypted to, and the author responses
    // are checked against. A string that isn't a key fails later, somewhere
    // less obvious.
    if (!/^[0-9a-f]{64}$/.test(pubkey)) {
      throw new Error('Invalid bunker URI: expected a hex pubkey');
    }

    for (const relay of relays) {
      if (!/^wss?:\/\//.test(relay)) {
        throw new Error(`Invalid bunker URI: ${relay} is not a relay URL`);
      }
    }

    this.pubkey = pubkey;
    this.relays = relays;
    this.secret = secret;
  }

  /** Convert into a `bunker://` URI string. */
  get href(): string {
    return this.toString();
  }

  /** Convert into a `bunker://` URI string. */
  toString(): string {
    return BunkerURI.toString(this);
  }

  /** Convert a bunker data object into a `BunkerURI` instance. */
  static fromJSON(data: { pubkey: string; relays: string[]; secret?: string }): BunkerURI {
    const uri = BunkerURI.toString(data);
    return new BunkerURI(uri);
  }

  /** Convert a bunker data object into a bunker URI string. */
  private static toString(data: { pubkey: string; relays: string[]; secret?: string }): string {
    const search = new URLSearchParams();

    for (const relay of data.relays) {
      search.append('relay', relay);
    }

    if (data.secret) {
      search.set('secret', data.secret);
    }

    return `bunker://${data.pubkey}?${search.toString()}`;
  }
}
