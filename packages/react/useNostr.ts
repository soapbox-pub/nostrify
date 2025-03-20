import { NConnectSigner, type NostrSigner, NRelay, NSecSigner } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { useContext } from 'react';

import { NostrContext } from './NostrContext.ts';

import type { NLogin } from './NState.ts';

interface NUser {
  pubkey: string;
  signer: NostrSigner;
  method: NLogin['type'];
}

interface UseNostr {
  user: NUser | undefined;
  users: NUser[];
}

export function useNostr(): UseNostr {
  const context = useContext(NostrContext);

  if (!context) {
    throw new Error('useNostr must be used within a NostrProvider');
  }

  const { logins } = context.state;

  const users = logins
    .map((login) => loginToUser(login, context.pool))
    .filter((user): user is NUser => !!user);

  return {
    user: users[0],
    users,
  };
}

function loginToUser(login: NLogin, relay: NRelay): NUser | undefined {
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
          relay,
          timeout: 60_000,
        }),
      };
    }
    case 'extension': {
      const windowSigner = (globalThis as unknown as { nostr?: NostrSigner }).nostr;

      if (!windowSigner) {
        return;
      }

      return {
        method: login.type,
        pubkey: login.pubkey,
        signer: windowSigner,
      };
    }
  }
}
