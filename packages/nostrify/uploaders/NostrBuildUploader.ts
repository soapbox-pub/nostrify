import { z } from 'zod';

import { N64 } from '../utils/N64.ts';
import { NIP98 } from '../NIP98.ts';
import type { NostrSigner, NUploader } from '@nostrify/types';

/** NostrBuildUploader options. */
export interface NostrBuildUploaderOpts {
  /** nostr.build endpoint to use. Default: `https://nostr.build/api/v2/upload/files` */
  endpoint?: string;
  /** Signer to authenticate with NIP-98 requests. */
  signer?: NostrSigner;
  /** Custom fetch implementation. */
  fetch?: typeof fetch;
}

/** Upload files to nostr.build or another compatible server. */
export class NostrBuildUploader implements NUploader {
  private endpoint: string;
  private signer?: NostrSigner;
  private fetch: typeof fetch;

  constructor(opts?: NostrBuildUploaderOpts) {
    this.endpoint = opts?.endpoint ?? 'https://nostr.build/api/v2/upload/files';
    this.signer = opts?.signer;
    this.fetch = opts?.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async upload(
    file: File,
    opts?: { signal?: AbortSignal },
  ): Promise<[['url', string], ...string[][]]> {
    const formData = new FormData();
    formData.append('fileToUpload', file);

    const request = new Request(this.endpoint, {
      method: 'POST',
      body: formData,
      signal: opts?.signal,
    });

    if (this.signer) {
      const t = await NIP98.template(request);
      const event = await this.signer.signEvent(t);
      request.headers.set('authorization', `Nostr ${N64.encodeEvent(event)}`);
    }

    const response = await this.fetch(request);
    const json = await response.json();
    console.log(json);
    const [data] = NostrBuildUploader.schema().parse(json).data;

    const tags: [['url', string], ...string[][]] = [
      ['url', data.url],
      ['m', data.mime],
      ['x', data.sha256],
      ['ox', data.original_sha256],
      ['size', data.size.toString()],
    ];

    if (data.dimensions) {
      tags.push(['dim', `${data.dimensions.width}x${data.dimensions.height}`]);
    }

    if (data.blurhash) {
      tags.push(['blurhash', data.blurhash]);
    }

    return tags;
  }

  /** nostr.build API response schema. */
  private static schema() {
    return z.object({
      data: z.object({
        url: z.string().url(),
        blurhash: z.string().optional().catch(undefined),
        sha256: z.string(),
        original_sha256: z.string(),
        mime: z.string(),
        size: z.number(),
        dimensions: z.object({
          width: z.number().positive(),
          height: z.number().positive(),
        }).optional().catch(undefined),
      }).array().min(1),
    });
  }
}
