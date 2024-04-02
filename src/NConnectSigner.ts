// deno-lint-ignore-file require-await

import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NostrSigner } from '../interfaces/NostrSigner.ts';
import { NRelay } from '../interfaces/NRelay.ts';

import { NSecSigner } from './NSecSigner.ts';

interface NConnectMsg {
  id: string;
  method: string;
  params: string | string[];
}

interface NConnectSignerOpts {
  /** Relay to facilitate connection. */
  relay: NRelay;
  /** Remote pubkey to sign as. */
  pubkey: string;
  /** Local key to connect with. */
  secretKey: Uint8Array;
}

/** [NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md) remote signer through a relay. */
export class NConnectSigner implements NostrSigner {
  private relay: NRelay;
  private pubkey: string;
  private signer: NostrSigner;
  private connected: boolean = false;

  constructor({ relay, pubkey, secretKey }: NConnectSignerOpts) {
    this.relay = relay;
    this.pubkey = pubkey;
    this.signer = new NSecSigner(secretKey);
  }

  private async connect(): Promise<void> {
    
  }

  private async send(msg: NConnectMsg, signal: AbortSignal): Promise<NConnectMsg> {
    const event = await this.signer.signEvent({
      kind: 24133,
      content: JSON.stringify(msg),
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
    });

    const req = this.relay.req(
      [{ kinds: [24133], authors: [this.pubkey], '#p': [event.pubkey] }],
      { signal },
    );

    this.relay.event(event);

    for await (const msg of req) {
      if (msg[0] === 'EVENT') return JSON.parse(msg[2].content);
    }

    throw new Error('No response from relay');
  }

  async getPublicKey(): Promise<string> {
    throw new Error('Not implemented');
  }

  async signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
    throw new Error('Not implemented');
  }

  readonly nip04 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
      throw new Error('Not implemented');
    },

    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      throw new Error('Not implemented');
    },
  };

  readonly nip44 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
      throw new Error('Not implemented');
    },

    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      throw new Error('Not implemented');
    },
  };
}
