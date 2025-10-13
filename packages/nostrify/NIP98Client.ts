import { type NostrSigner } from '@nostrify/types';
import { NIP98 } from './NIP98.ts';
import { N64 } from './utils/N64.ts';

export interface NIP98ClientOpts {
  signer: NostrSigner;
  fetch?: typeof globalThis.fetch;
}

/** Wraps a fetch request with NIP98 authentication */
export class NIP98Client {
  private signer: NostrSigner;
  private customFetch: typeof globalThis.fetch;

  constructor(opts: NIP98ClientOpts) {
    this.signer = opts.signer;
    this.customFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** Performs a fetch request with NIP98 authentication */
  async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    // Normalize to a Request object
    const request = new Request(input, init);

    // Create the NIP98 token
    const template = await NIP98.template(request);
    const event = await this.signer.signEvent(template);
    const token = N64.encodeEvent(event);

    // Add the Authorization header
    request.headers.set('Authorization', `Nostr ${token}`);

    // Call the custom fetch function
    return this.customFetch(request);
  }
}
