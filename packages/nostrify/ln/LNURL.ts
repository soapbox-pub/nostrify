import type { NostrEvent } from '@nostrify/types';
import { bech32 } from '@scure/base';

import { LNURLCallback } from './types/LNURLCallback.ts';
import { LNURLDetails } from './types/LNURLDetails.ts';

import { NSchema as n, z } from '../NSchema.ts';

/** Validators, built once, since `NSchema` constructs a new schema tree on every call. */
const bech32Schema = n.bech32();
const emailSchema = z.string().email();

/**
 * LUD-16 limits the name to `a-z0-9-_.`, plus `+` where the service supports
 * tags — a stricter set than an email local part, and one that contains no
 * character that could end a URL path segment.
 */
const nameRegex = /^[a-z0-9\-_.+]+$/;

/** A DNS name, as the host half of an address has to be. */
const domainRegex = /^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/;

/**
 * Represents an LNURL, with methods to fetch details and generate invoices.
 */
export class LNURL {
  /** Underlying HTTP(s) URL of the user. */
  readonly url: URL;
  /** Fetch function to use for HTTP requests. */
  private fetch: typeof globalThis.fetch;

  constructor(
    /** Underlying HTTP(s) URL of the user. */
    url: URL,
    /** Options for the LNURL class. */
    opts?: {
      /** Fetch function to use for HTTP requests. */
      fetch: typeof globalThis.fetch;
    },
  ) {
    this.url = LNURL.endpoint(url);
    this.fetch = opts?.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Check that a URL is one an LNURL flow may fetch, and return it.
   *
   * LUD-01 has these served over https, or http for an onion service. Both ends
   * of the flow need this: the address itself arrives bech32-encoded, so it can
   * decode to any string at all, and the `callback` is chosen by whatever
   * server answered the first request.
   */
  private static endpoint(url: URL): URL {
    if (url.protocol === 'https:') return url;
    if (url.protocol === 'http:' && url.hostname.endsWith('.onion')) return url;

    throw new Error('LNURL endpoints must be https, or http for an onion service');
  }

  /**
   * Create an LNURL object from a bech32 `lnurl1...` string.
   * Throws if the value is not a valid lnurl.
   */
  static fromString(
    value: string,
    opts?: { fetch: typeof globalThis.fetch },
  ): LNURL {
    if (!bech32Schema.safeParse(value).success) {
      throw new Error('Expected a bech32 string starting with "lnurl1"');
    }

    const { prefix, words } = bech32.decode(
      value as `${string}1${string}`,
      20000,
    );

    if (prefix !== 'lnurl') {
      throw new Error('Expected a bech32 string starting with "lnurl1"');
    }

    const data = bech32.fromWords(words);
    const url = new URL(new TextDecoder().decode(data));

    return new LNURL(url, opts);
  }

  /**
   * Create an LNURL object from a lightning address (email-like format).
   * Throws if the value is not a valid lightning address.
   */
  static fromLightningAddress(
    ln: string,
    opts?: { fetch: typeof globalThis.fetch },
  ): LNURL {
    if (!emailSchema.safeParse(ln).success) {
      throw new Error(
        'Expected a lightning address in email-like format (eg "example@getalby.com")',
      );
    }

    // LUD-16 addresses are lowercase, and both halves go into a URL — the name
    // as a path segment and the host as the authority — so neither can be taken
    // on the say-so of an email regex, which allows characters that would
    // change the meaning of both.
    const [name, host] = ln.toLowerCase().split('@');

    // `.` is a legal character in a name, so the charset alone still admits
    // `..`, which `new URL` would resolve as a step up the path.
    if (!nameRegex.test(name) || /^\.+$/.test(name)) {
      throw new Error(`Invalid lightning address name: ${name}`);
    }

    if (!domainRegex.test(host)) {
      throw new Error(`Invalid lightning address domain: ${host}`);
    }

    const url = new URL(`/.well-known/lnurlp/${name}`, `https://${host}/`);

    return new LNURL(url, opts);
  }

  /** Returns the LNURL object as a bech32-encoded `lnurl1...` string. */
  toString(): `lnurl1${string}` {
    const data = new TextEncoder().encode(this.url.toString());
    const words = bech32.toWords(data);
    return bech32.encode('lnurl', words, 20000);
  }

  /** Resolve an LNURL to its details. */
  async getDetails(opts?: { signal?: AbortSignal }): Promise<LNURLDetails> {
    const response = await this.fetch(this.url, opts);
    const json = await response.json();
    return LNURL.lnurlDetailsSchema().parse(json);
  }

  /** Generate an LNURL invoice from the params. */
  async getInvoice(opts: {
    /** Amount in millisatoshis to send to the user. */
    amount: number;
    /** NIP-57 Zap Request (kind 9734) event. */
    nostr?: NostrEvent;
    /** Signal to abort the request. */
    signal?: AbortSignal;
  }): Promise<LNURLCallback> {
    const details = await this.getDetails(opts);
    const callback = LNURL.endpoint(new URL(details.callback));

    callback.searchParams.set('amount', opts.amount.toString());
    callback.searchParams.set('lnurl', this.toString());

    if (opts.nostr) {
      callback.searchParams.set('nostr', JSON.stringify(opts.nostr));
    }

    const response = await this.fetch(callback, opts);
    const json = await response.json();

    return LNURL.lnurlCallbackSchema().parse(json);
  }

  /** LNURL response schema. */
  static lnurlDetailsSchema(): z.ZodType<LNURLDetails> {
    return LNURL.#lnurlDetailsSchema ??= z.object({
      allowsNostr: z.boolean().optional(),
      callback: z.string().url(),
      commentAllowed: z.number().nonnegative().int().optional(),
      maxSendable: z.number().positive().int(),
      minSendable: z.number().positive().int(),
      metadata: z.string(),
      nostrPubkey: n.id().optional(),
      tag: z.literal('payRequest'),
    }).superRefine((details, ctx) => {
      if (details.minSendable > details.maxSendable) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'minSendable must be less than or equal to maxSendable',
          path: ['minSendable'],
        });
      }
    }) as z.ZodType<LNURLDetails>;
  }

  /** LNURL callback schema. */
  static lnurlCallbackSchema(): z.ZodType<LNURLCallback> {
    return LNURL.#lnurlCallbackSchema ??= z.object({
      pr: n.bech32('lnbc'),
      routes: z.tuple([]),
    }) as unknown as z.ZodType<LNURLCallback>;
  }

  /** Memoized schemas, so they aren't reconstructed on every call. */
  static #lnurlDetailsSchema: z.ZodType<LNURLDetails> | undefined;
  static #lnurlCallbackSchema: z.ZodType<LNURLCallback> | undefined;
}
