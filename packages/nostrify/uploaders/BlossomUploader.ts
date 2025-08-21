import type { NostrSigner, NUploader } from '@nostrify/types';
import { encodeHex } from '@std/encoding/hex';
import { z } from 'zod';

import { N64 } from '../utils/N64.ts';

/** BlossomUploader options. */
export interface BlossomUploaderOpts {
  /** Blossom servers to use. */
  servers: Request['url'][];
  /** Signer for Blossom authorizations. */
  signer: NostrSigner;
  /** Custom fetch implementation. */
  fetch?: typeof fetch;
  /** Number of milliseconds until each request should expire. (Default: `60_000`) */
  expiresIn?: number;
}

/** Upload files to Blossom servers. */
export class BlossomUploader implements NUploader {
  private servers: Request['url'][];
  private signer: NostrSigner;
  private fetch: typeof fetch;
  private expiresIn: number;

  constructor(opts: BlossomUploaderOpts) {
    this.servers = opts.servers;
    this.signer = opts.signer;
    this.fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.expiresIn = opts.expiresIn ?? 60_000;
  }

  async upload(
    file: File,
    opts?: { signal?: AbortSignal },
  ): Promise<[['url', string], ...string[][]]> {
    const x = encodeHex(
      await crypto.subtle.digest('SHA-256', await file.arrayBuffer()),
    );

    const now = Date.now();
    const expiration = now + this.expiresIn;

    const event = await this.signer.signEvent({
      kind: 24242,
      content: `Upload ${file.name}`,
      created_at: Math.floor(now / 1000),
      tags: [
        ['t', 'upload'],
        ['x', x],
        ['size', file.size.toString()],
        ['expiration', Math.floor(expiration / 1000).toString()],
      ],
    });

    const authorization = `Nostr ${N64.encodeEvent(event)}`;

    return Promise.any(this.servers.map(async (server) => {
      const url = new URL('/upload', server);

      const response = await this.fetch(url, {
        method: 'PUT',
        body: file,
        headers: {
          authorization,
          'content-type': file.type,
        },
        signal: opts?.signal,
      });

      const json = await response.json();
      const data = BlossomUploader.schema().parse(json);

      const tags: [['url', string], ...string[][]] = [
        ['url', data.url],
        ['x', data.sha256],
        ['ox', data.sha256],
        ['size', data.size.toString()],
      ];

      if (data.type) {
        tags.push(['m', data.type]);
      }

      return tags;
    }));
  }

  /** Blossom "BlobDescriptor" schema. */
  private static schema() {
    return z.object({
      url: z.string(),
      sha256: z.string(),
      size: z.number(),
      type: z.string().optional(),
    });
  }
}
