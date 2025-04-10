import { NConnectSigner, type NostrSigner, NPool, NSecSigner } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import type { NUser } from '../../NostrContext.ts';
import type { NLogin } from '../NLogin.ts';

export function loginToUser(login: NLogin, pool: NPool): NUser {
  switch (login.type) {
    case 'nsec': {
      const sk = nip19.decode(login.nsec);
      return {
        method: login.type,
        pubkey: login.pubkey,
        signer: new NSecSigner(sk.data),
      };
    }
    case 'bunker': {
      const clientSk = nip19.decode(login.clientNsec);
      const clientSigner = new NSecSigner(clientSk.data);

      return {
        method: login.type,
        pubkey: login.pubkey,
        signer: new NConnectSigner({
          pubkey: login.pubkey,
          signer: clientSigner,
          relay: pool.relay(login.relays[0]),
          timeout: 60_000,
        }),
      };
    }
    case 'extension': {
      const windowSigner = (globalThis as unknown as { nostr?: NostrSigner }).nostr;

      if (!windowSigner) {
        throw new Error('Nostr extension is not available');
      }

      return {
        method: login.type,
        pubkey: login.pubkey,
        signer: windowSigner,
      };
    }
  }
}
