// deno-lint-ignore-file require-await

import { z } from 'zod';

import type { NostrConnectRequest, NostrConnectResponse, NostrEvent, NostrSigner, NRelay } from '@nostrify/types';

import { NSchema as n } from './NSchema.ts';

/** Options for `NConnectSigner`. */
export interface NConnectSignerOpts {
  /** Relay to facilitate connection. */
  relay: NRelay;
  /** Remote pubkey to sign as. */
  pubkey: string;
  /** Local signer to sign the request events. */
  signer: NostrSigner;
  /** Timeout for requests. */
  timeout?: number;
  /** Encryption to use when encrypting local messages. Decryption is automatic. */
  encryption?: 'nip04' | 'nip44';
}

/** [NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md) remote signer through a relay. */
export class NConnectSigner implements NostrSigner {
  private relay: NRelay;
  private pubkey: string;
  private signer: NostrSigner;
  private timeout?: number;
  private encryption: 'nip04' | 'nip44';

  constructor(
    { relay, pubkey, signer, timeout, encryption = 'nip44' }: NConnectSignerOpts,
  ) {
    this.relay = relay;
    this.pubkey = pubkey;
    this.signer = signer;
    this.timeout = timeout;
    this.encryption = encryption;
  }

  async getPublicKey(): Promise<string> {
    return this.cmd('get_public_key', []);
  }

  async signEvent(
    event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>,
  ): Promise<NostrEvent> {
    const result = await this.cmd('sign_event', [JSON.stringify(event)]);
    return n.json().pipe(n.event()).parse(result);
  }

  async getRelays(): Promise<
    Record<string, { read: boolean; write: boolean }>
  > {
    const result = await this.cmd('get_relays', []);

    return n
      .json()
      .pipe(
        z.record(
          z.string(),
          z.object({ read: z.boolean(), write: z.boolean() }),
        ),
      )
      .parse(result) as Record<string, { read: boolean; write: boolean }>; // FIXME: hack!
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

  /** Send a `connect` command to the relay. It should respond with `ack`. */
  async connect(secret?: string): Promise<string> {
    const params: string[] = [this.pubkey];

    if (secret) {
      params.push(secret);
    }

    return this.cmd('connect', params);
  }

  /** Send a `ping` command to the signer. It should respond with `pong`. */
  async ping(): Promise<string> {
    return this.cmd('ping', []);
  }

  /** High-level RPC method. Returns the string result, or throws on error. */
  private async cmd(method: string, params: string[]): Promise<string> {
    const signal = typeof this.timeout === 'number' ? AbortSignal.timeout(this.timeout) : undefined;

    const { result, error } = await this.send(
      { id: crypto.randomUUID(), method, params },
      { signal },
    );

    if (error) {
      throw new Error(error);
    }

    return result;
  }

  /** Low-level send method. Deals directly with connect request/response. */
  private async send(
    request: NostrConnectRequest,
    opts: { signal?: AbortSignal } = {},
  ): Promise<NostrConnectResponse> {
    const { signal } = opts;

    const event = await this.signer.signEvent({
      kind: 24133,
      content: await this.encrypt(this.pubkey, JSON.stringify(request)),
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', this.pubkey]],
    });

    const local = await this.signer.getPublicKey();

    const req = this.relay.req(
      [{ kinds: [24133], authors: [this.pubkey], '#p': [local] }],
      { signal },
    );

    // Ensure the REQ is opened before sending the EVENT
    const promise = new Promise<NostrConnectResponse>((resolve, reject) => {
      (async () => {
        try {
          for await (const msg of req) {
            if (msg[0] === 'CLOSED') throw new Error('Subscription closed');
            if (msg[0] === 'EVENT') {
              const event = msg[2];
              const decrypted = await this.decrypt(this.pubkey, event.content);
              const response = n.json().pipe(n.connectResponse()).parse(
                decrypted,
              );
              if (response.id === request.id) {
                resolve(response);
                return;
              }
            }
          }
        } catch (error) {
          reject(error);
        }
      })();
    });

    await this.relay.event(event, { signal });
    return promise;
  }

  /** Local encrypt depending on settings. */
  private async encrypt(pubkey: string, plaintext: string): Promise<string> {
    switch (this.encryption) {
      case 'nip04':
        return this.signer.nip04!.encrypt(pubkey, plaintext);
      case 'nip44':
        return this.signer.nip44!.encrypt(pubkey, plaintext);
    }
  }

  /** Local decrypt depending on settings. */
  private async decrypt(pubkey: string, ciphertext: string): Promise<string> {
    switch (this.encryption) {
      case 'nip04':
        return this.signer.nip04!.decrypt(pubkey, ciphertext);
      case 'nip44':
        return this.signer.nip44!.decrypt(pubkey, ciphertext);
    }
  }
}
