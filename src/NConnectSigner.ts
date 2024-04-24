// deno-lint-ignore-file require-await

import { NostrConnectRequest, NostrConnectResponse } from '../interfaces/NostrConnect.ts';
import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NostrSigner } from '../interfaces/NostrSigner.ts';
import { NRelay } from '../interfaces/NRelay.ts';

import { NSchema as n } from './NSchema.ts';

interface NConnectSignerOpts {
  /** Relay to facilitate connection. */
  relay: NRelay;
  /** Remote pubkey to sign as. */
  pubkey: string;
  /** Local signer to sign the request events. */
  signer: NostrSigner;
  /** Timeout for requests. */
  timeout?: number;
}

/** [NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md) remote signer through a relay. */
export class NConnectSigner implements NostrSigner {
  private relay: NRelay;
  private pubkey: string;
  private signer: NostrSigner;
  private timeout?: number;

  private connected: boolean = false;
  private ee = new EventTarget();

  constructor({ relay, pubkey, signer, timeout }: NConnectSignerOpts) {
    this.relay = relay;
    this.pubkey = pubkey;
    this.signer = signer;
    this.timeout = timeout;
  }

  private async connect(): Promise<void> {
  }

  async getPublicKey(): Promise<string> {
    return this.cmd('get_public_key', []);
  }

  async signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
    const result = await this.cmd('sign_event', [JSON.stringify(event)]);
    return n.json().pipe(n.event()).parse(result);
  }

  readonly nip04 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
      return this.cmd('nip04_encrypt', [pubkey, plaintext]);
    },

    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      return this.cmd('nip04_decrypt', [pubkey, ciphertext]);
    },
  };

  readonly nip44 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
      return this.cmd('nip44_encrypt', [pubkey, plaintext]);
    },

    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      return this.cmd('nip44_decrypt', [pubkey, ciphertext]);
    },
  };

  /** High-level RPC method. Returns the string result, or throws on error. */
  private async cmd(method: string, params: string[]): Promise<string> {
    const signal = typeof this.timeout === 'number' ? AbortSignal.timeout(this.timeout) : undefined;

    const { result, error } = await this.send(
      { id: method, method, params },
      { signal },
    );

    if (error) {
      throw new Error(error);
    }

    return result;
  }

  /** Low-level send method. Deals directly with connect request/response. */
  private async send(request: NostrConnectRequest, opts: { signal?: AbortSignal } = {}): Promise<NostrConnectResponse> {
    const { signal } = opts;

    const event = await this.signer.signEvent({
      kind: 24133,
      content: JSON.stringify(request),
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', this.pubkey]],
    });

    const req = this.relay.req(
      [{ kinds: [24133], authors: [this.pubkey], '#p': [event.pubkey] }],
      { signal },
    );

    this.relay.event(event, { signal });

    for await (const msg of req) {
      if (msg[0] === 'EVENT') {
        const event = msg[2];
        const decrypted = await this.signer.nip04!.decrypt(this.pubkey, event.content);
        const response = n.json().pipe(n.connectResponse()).parse(decrypted);
        if (response.id === request.id) {
          return response;
        }
      }
    }

    throw new Error('No response from relay');
  }
}
