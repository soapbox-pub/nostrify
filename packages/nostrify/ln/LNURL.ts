import type { NostrEvent } from '@nostrify/types';
import { bech32 } from '@scure/base';

import { LNURLCallback } from './types/LNURLCallback.ts';
import { LNURLDetails } from './types/LNURLDetails.ts';

import { NSchema as n, z } from '../NSchema.ts';

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
    this.url = url;
    this.fetch = opts?.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Create an LNURL object from a bech32 `lnurl1...` string.
   * Throws if the value is not a valid lnurl.
   */
  static fromString(
    value: string,
    opts?: { fetch: typeof globalThis.fetch },
  ): LNURL {
    if (!n.bech32().safeParse(value).success) {
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
    if (!z.string().email().safeParse(ln).success) {
      throw new Error(
        'Expected a lightning address in email-like format (eg "example@getalby.com")',
      );
    }

    const [name, host] = ln.split('@');
    const url = new URL(`/.well-known/lnurlp/${name}`, `https://${host}`);

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
    const callback = new URL(details.callback);

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
    return z.object({
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
    return z.object({
      pr: n.bech32('lnbc'),
      routes: z.tuple([]),
    }) as unknown as z.ZodType<LNURLCallback>;
  }
}
