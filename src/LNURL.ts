import { bech32 } from 'npm:@scure/base@^1.1.5';

import { LNURLDetails } from '../interfaces/LNURLDetails.ts';

import { n, z } from './schema.ts';

interface LookupOpts {
  fetch?: typeof fetch;
  signal?: AbortSignal | null;
  limit?: number;
}

export class LNURL {
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
    });
  }

  /** Resolve an LNURL to its details. */
  static async lookup(lnurl: string, opts?: LookupOpts): Promise<LNURLDetails> {
    const { fetch = globalThis.fetch, signal, limit } = opts ?? {};

    const url = LNURL.decode(lnurl, limit);
    const res = await fetch(url, { signal });

    return LNURL.lnurlDetailsSchema().parse(await res.json());
  }

  /** Decode an LNURL into a URL. */
  static decode(lnurl: string, limit = 20000): URL {
    const { prefix, words } = bech32.decode(lnurl, limit);
    if (prefix !== 'lnurl') throw new Error('Invalid LNURL');
    const data = new Uint8Array(bech32.fromWords(words));
    return new URL(new TextDecoder().decode(data));
  }

  /** Encode a URL to LNURL format. */
  static encode(url: string | URL, limit = 20000): `lnurl1${string}` {
    const data = new TextEncoder().encode(url.toString());
    const words = bech32.toWords(data);
    return bech32.encode('lnurl', words, limit);
  }
}
