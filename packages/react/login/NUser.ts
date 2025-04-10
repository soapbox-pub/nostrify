import { NConnectSigner, type NostrSigner, type NPool, NSecSigner } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import type { NLoginBunker, NLoginExtension, NLoginNsec } from './NLogin.ts';

/** Represents a Nostr user with authentication credentials. */
export class NUser {
  constructor(
    /** The authentication method used for this user */
    readonly method: 'nsec' | 'bunker' | 'extension' | `x-${string}`,
    /** The public key of the user in hex format. */
    readonly pubkey: string,
    /** The signer that can sign events on behalf of this user. */
    readonly signer: NostrSigner,
  ) {}

  static fromNsecLogin(login: NLoginNsec): NUser {
    const sk = nip19.decode(login.nsec);

    return {
      method: login.type,
      pubkey: login.pubkey,
      signer: new NSecSigner(sk.data),
    };
  }

  static fromBunkerLogin(login: NLoginBunker, pool: NPool): NUser {
    const clientSk = nip19.decode(login.clientNsec);
    const clientSigner = new NSecSigner(clientSk.data);

    return new NUser(
      login.type,
      login.pubkey,
      new NConnectSigner({
        relay: pool.group(login.relays),
        pubkey: login.pubkey,
        signer: clientSigner,
        timeout: 60_000,
      }),
    );
  }

  static fromExtensionLogin(login: NLoginExtension): NUser {
    const windowSigner = (globalThis as unknown as { nostr?: NostrSigner }).nostr;

    if (!windowSigner) {
      throw new Error('Nostr extension is not available');
    }

    return new NUser(
      login.type,
      login.pubkey,
      windowSigner,
    );
  }
}
