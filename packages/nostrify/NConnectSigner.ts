// deno-lint-ignore-file require-await

import { verifyEvent as _verifyEvent } from 'nostr-tools';
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
  /** Ensure an event returned by `sign_event` is valid. Default: `nostrTools.verifyEvent`. */
  verifyEvent?(event: NostrEvent): boolean;
}

/** [NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md) remote signer through a relay. */
export class NConnectSigner implements NostrSigner {
  /** Parsers, built once, since `NSchema` constructs a new schema tree on every call. */
  private static readonly eventSchema = n.json().pipe(n.event());
  private static readonly responseSchema = n.json().pipe(n.connectResponse());
  private static readonly relaysSchema = n
    .json()
    .pipe(z.record(z.string(), z.object({ read: z.boolean(), write: z.boolean() })));

  private relay: NRelay;
  private pubkey: string;
  private signer: NostrSigner;
  private timeout?: number;
  private encryption: 'nip04' | 'nip44';
  private verifyEvent: (event: NostrEvent) => boolean;

  constructor(
    { relay, pubkey, signer, timeout, encryption = 'nip44', verifyEvent = _verifyEvent }: NConnectSignerOpts,
  ) {
    this.relay = relay;
    this.pubkey = pubkey;
    this.signer = signer;
    this.timeout = timeout;
    this.encryption = encryption;
    this.verifyEvent = verifyEvent;
  }

  async getPublicKey(): Promise<string> {
    return this.cmd('get_public_key', []);
  }

  async signEvent(
    event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>,
  ): Promise<NostrEvent> {
    const result = await this.cmd('sign_event', [JSON.stringify(event)]);
    const signed = NConnectSigner.eventSchema.parse(result);

    // The remote signer holds the user's key, but that doesn't make whatever it
    // returns an event: check the `id` and `sig` before handing it to a caller
    // who is about to publish it. Note the signature is over the *user* key,
    // which NIP-46 allows to differ from the remote-signer key this connection
    // is with, so there is no pubkey here to pin it to.
    if (!this.verifyEvent(signed)) {
      throw new Error('Remote signer returned an invalid event');
    }

    return signed;
  }

  async getRelays(): Promise<
    Record<string, { read: boolean; write: boolean }>
  > {
    const result = await this.cmd('get_relays', []);

    return NConnectSigner.relaysSchema.parse(result) as Record<string, { read: boolean; write: boolean }>; // FIXME: hack!
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

              // The `authors` filter is a request, not a guarantee — the relay
              // is the party being asked to honor it, and it is also the party
              // best placed to answer in the signer's stead. Per NIP-46 the
              // response comes from the remote-signer key, so anything else
              // isn't a response to this connection.
              if (event.pubkey !== this.pubkey) continue;

              // Past the author check, this event is from the signer we are
              // connected to — reaching here with a payload we can't read means
              // that signer failed us, so say so rather than letting the caller
              // sit until the timeout with nothing to go on. Nobody else can
              // get here: forging this author requires forging its signature.
              let response: NostrConnectResponse;
              try {
                const decrypted = await this.decrypt(this.pubkey, event.content);
                response = NConnectSigner.responseSchema.parse(decrypted);
              } catch (e) {
                throw new Error('Failed to read the response from the remote signer', { cause: e });
              }

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

  /**
   * Local decrypt, dispatched on the ciphertext rather than on `encryption`.
   * NIP-46 lets a signer answer in either scheme regardless of which one the
   * request used, so the setting says nothing about what comes back. NIP-04
   * ciphertext ends in `?iv=<iv>`, and `?` is outside the base64 alphabet a
   * NIP-44 payload is confined to, so the two can't be confused.
   */
  private async decrypt(pubkey: string, ciphertext: string): Promise<string> {
    const scheme = ciphertext.includes('?iv=') ? 'nip04' : 'nip44';
    const nip = this.signer[scheme];

    if (!nip) {
      throw new Error(`Remote signer replied with ${scheme}, which the local signer does not implement`);
    }

    return nip.decrypt(pubkey, ciphertext);
  }
}
