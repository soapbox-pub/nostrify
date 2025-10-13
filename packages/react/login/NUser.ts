import { NBrowserSigner, NConnectSigner, NSecSigner } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import type { NPool } from '@nostrify/nostrify';
import type { NostrSigner } from '@nostrify/types';

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
    const sk = nip19.decode(login.data.nsec) as {
      type: 'nsec';
      data: Uint8Array;
    };

    return new NUser(
      login.type,
      login.pubkey,
      new NSecSigner(sk.data),
    );
  }

  static fromBunkerLogin(login: NLoginBunker, pool: NPool): NUser {
    const clientSk = nip19.decode(login.data.clientNsec) as {
      type: 'nsec';
      data: Uint8Array;
    };
    const clientSigner = new NSecSigner(clientSk.data);

    return new NUser(
      login.type,
      login.pubkey,
      new NConnectSigner({
        relay: pool.group(login.data.relays),
        pubkey: login.pubkey,
        signer: clientSigner,
        timeout: 60_000,
      }),
    );
  }

  static fromExtensionLogin(login: NLoginExtension): NUser {
    return new NUser(
      login.type,
      login.pubkey,
      new NBrowserSigner(),
    );
  }
}
